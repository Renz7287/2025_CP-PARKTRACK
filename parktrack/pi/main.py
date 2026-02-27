import cv2
import config
import json
import logging
import numpy as np
import os
import signal
import subprocess
import sys
import tempfile
import time
from shapely.geometry import Point
from ultralytics import YOLO
from slot_fetcher import SlotFetcher

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

#  Ensure output directories exist 
config.VIDEO_DIR.mkdir(parents=True, exist_ok=True)
config.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

def open_video_source():
    """
    Return an OpenCV VideoCapture for either the Pi camera or a test file.

    When USE_PI_CAMERA = True:
        Uses picamera2 via the OpenCV GStreamer backend.
        Install with: pip install picamera2
    When USE_PI_CAMERA = False:
        Opens the file at config.VIDEO_FILE and loops it to simulate a
        continuous live feed.
    """
    if config.USE_PI_CAMERA:
        # GStreamer pipeline for Pi Camera Module 3 (adjust sensor-id for
        # your specific camera module if needed).
        gst_pipeline = (
            "libcamerasrc ! "
            "video/x-raw,width={w},height={h},framerate={fps}/1 ! "
            "videoconvert ! appsink"
        ).format(w=config.OUTPUT_WIDTH, h=config.OUTPUT_HEIGHT, fps=config.OUTPUT_FPS)
        cap = cv2.VideoCapture(gst_pipeline, cv2.CAP_GSTREAMER)
    else:
        cap = cv2.VideoCapture(str(config.VIDEO_FILE))

    if not cap.isOpened():
        source = "Pi camera" if config.USE_PI_CAMERA else str(config.VIDEO_FILE)
        logger.error("Cannot open video source: %s", source)
        sys.exit(1)

    return cap

def start_ffmpeg():
    """Start the FFmpeg HLS streaming subprocess and return the Popen handle."""
    logger.info("Starting FFmpeg …")
    proc = subprocess.Popen(config.FFMPEG_CMD, stdin=subprocess.PIPE)
    logger.info("FFmpeg started (PID %d)", proc.pid)
    return proc

# Detection helpers
def get_centroids(yolo_results) -> list:
    centroids = []

    if not (hasattr(yolo_results, "boxes") and len(yolo_results.boxes) > 0):
        return centroids

    xyxy = yolo_results.boxes.xyxy
    if hasattr(xyxy, "cpu"):
        xyxy = xyxy.cpu().numpy()
    else:
        xyxy = np.array(xyxy)

    for box in xyxy:
        x1, y1, x2, y2 = map(float, box[:4])
        if (x2 - x1) < config.MIN_BOX_PIXELS or (y2 - y1) < config.MIN_BOX_PIXELS:
            continue
        centroids.append(((x1 + x2) / 2.0, (y1 + y2) / 2.0))

    return centroids


def update_occupancy(slots: list, centroids: list):
    for slot in slots:
        present = any(slot["poly"].contains(Point(cx, cy)) for cx, cy in centroids)
        slot["history"].append(1 if present else 0)
        slot["is_occupied"] = sum(slot["history"]) >= config.SMOOTH_THRESHOLD


def draw_overlays(frame: np.ndarray, slots: list) -> np.ndarray:
    for slot in slots:
        color  = (0, 0, 255) if slot["is_occupied"] else (0, 255, 0)
        label  = "Occupied" if slot["is_occupied"] else "Vacant"
        pts    = slot["pts_np"]

        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
        text_x = int(pts[0][0])
        text_y = int(max(pts[0][1] - 8, 10))
        cv2.putText(frame, f"{slot['slot_label']} {label}", (text_x, text_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)

    return frame


def write_status_json(slots: list):
    status = {
        "timestamp": int(time.time()),
        "occupied":  sum(1 for s in slots if s["is_occupied"]),
        "vacant":    sum(1 for s in slots if not s["is_occupied"]),
        "slots": [
            {"id": s["id"], "slot_label": s["slot_label"], "occupied": bool(s["is_occupied"])}
            for s in slots
        ],
    }

    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(config.VIDEO_DIR))
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(status, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, config.VIDEO_DIR / "status.json")
    except Exception as exc:
        logger.error("Failed to write status.json: %s", exc)
        try:
            os.remove(tmp_path)
        except OSError:
            pass

def save_snapshot(frame: np.ndarray, slots: list, now: float):
    snapshot_path = config.SNAPSHOT_DIR / f"snapshot_{int(now)}.jpg"
    sidecar_path  = config.SNAPSHOT_DIR / f"snapshot_{int(now)}.json"

    cv2.imwrite(str(snapshot_path), frame)

    with open(sidecar_path, "w") as f:
        json.dump({
            "timestamp": int(now),
            "occupied":  sum(1 for s in slots if s["is_occupied"]),
            "vacant":    sum(1 for s in slots if not s["is_occupied"]),
        }, f)

    logger.info("Snapshot saved: %s", snapshot_path.name)

    # Remove oldest snapshots beyond the maximum count
    snapshots = sorted(config.SNAPSHOT_DIR.glob("snapshot_*.jpg"), key=os.path.getmtime)
    for old in snapshots[: -config.MAX_SNAPSHOTS]:
        old.unlink(missing_ok=True)
        old.with_suffix(".json").unlink(missing_ok=True)


def main():
    fetcher = SlotFetcher()
    fetcher.start()

    logger.info("Loading YOLO model: %s", config.YOLO_MODEL_PATH)
    model = YOLO(str(config.YOLO_MODEL_PATH))

    cap     = open_video_source()
    ffmpeg  = start_ffmpeg()

    def shutdown(sig=None, frame=None):
        logger.info("Shutting down …")
        fetcher.stop()
        try:
            ffmpeg.stdin.close()
        except Exception:
            pass
        try:
            ffmpeg.terminate()
        except Exception:
            pass
        cap.release()
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    #  Loop state 
    frame_interval    = 1.0 / config.OUTPUT_FPS
    last_frame_time   = 0.0
    last_snapshot_time = 0.0
    frame_count       = 0

    logger.info("Detection loop started. Press Ctrl+C to stop.")

    try:
        while True:
            # Frame rate throttle
            now = time.time()
            if now - last_frame_time < frame_interval:
                time.sleep(0.001)
                continue
            last_frame_time = now

            # Read frame 
            ret, frame = cap.read()
            if not ret:
                if config.USE_PI_CAMERA:
                    logger.warning("Camera read failed — retrying …")
                    time.sleep(0.1)
                    continue
                else:
                    # Loop test video
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

            frame = cv2.resize(frame, (config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT),
                               interpolation=cv2.INTER_LINEAR)

            # Get latest slots (non-blocking, always up-to-date) 
            slots = fetcher.get_slots()

            # YOLO inference 
            results   = model(frame, conf=config.YOLO_CONFIDENCE, verbose=False)[0]
            centroids = get_centroids(results)

            update_occupancy(slots, centroids)

            frame = draw_overlays(frame, slots)

            #  Periodic status.json write 
            frame_count += 1
            if frame_count % config.WRITE_STATUS_EVERY == 0:
                write_status_json(slots)

            #  Periodic snapshot ─
            if now - last_snapshot_time >= config.SNAPSHOT_INTERVAL:
                save_snapshot(frame, slots, now)
                last_snapshot_time = now

            #  Pipe frame to FFmpeg 
            try:
                ffmpeg.stdin.write(frame.tobytes())
            except BrokenPipeError:
                logger.error("FFmpeg pipe closed — exiting.")
                break

    except KeyboardInterrupt:
        pass
    finally:
        shutdown()

if __name__ == "__main__":
    main()