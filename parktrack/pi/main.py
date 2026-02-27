import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import time
import cv2
import numpy as np
from shapely.geometry import Point
from ultralytics import YOLO
import config
from slot_fetcher import SlotFetcher

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

config.VIDEO_DIR.mkdir(parents=True, exist_ok=True)
config.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

def open_video_source():    
    # Return an OpenCV VideoCapture from one of three sources:
    # USE_USB_CAMERA = True   → USB webcam via /dev/video<USB_CAMERA_INDEX>
    # USE_PI_CAMERA  = True   → Pi Camera Module via GStreamer/libcamera
    # Both False              → test video file at VIDEO_FILE (loops)  

    if config.USE_USB_CAMERA:
        # USB camera — works out of the box on Linux, no extra drivers needed.
        # Set USB_CAMERA_INDEX = 0 for the first USB camera (default),
        # 1 for the second, etc. Run `ls /dev/video*` to check.
        cap = cv2.VideoCapture(config.USB_CAMERA_INDEX)
        source = f"USB camera (index {config.USB_CAMERA_INDEX})"

    elif config.USE_PI_CAMERA:
        # Pi Camera Module via GStreamer + libcamera (Pi OS Bullseye and later)
        gst_pipeline = (
            "libcamerasrc ! "
            "video/x-raw,width={w},height={h},framerate={fps}/1 ! "
            "videoconvert ! appsink"
        ).format(w=config.OUTPUT_WIDTH, h=config.OUTPUT_HEIGHT, fps=config.OUTPUT_FPS)
        cap = cv2.VideoCapture(gst_pipeline, cv2.CAP_GSTREAMER)
        source = "Pi Camera Module (libcamera)"

    else:
        # Test video file — loops indefinitely to simulate a live feed
        cap = cv2.VideoCapture(str(config.VIDEO_FILE))
        source = str(config.VIDEO_FILE)

    if not cap.isOpened():
        logger.error("Cannot open video source: %s", source)
        sys.exit(1)

    logger.info("Video source opened: %s", source)
    return cap

def start_ffmpeg():
    # Start the FFmpeg HLS streaming subprocess and return the Popen handle.
    logger.info("Starting FFmpeg …")
    proc = subprocess.Popen(config.FFMPEG_CMD, stdin=subprocess.PIPE)
    logger.info("FFmpeg started (PID %d)", proc.pid)
    return proc

def get_centroids(yolo_results) -> list:  
    # Extract (cx, cy) centroids from YOLO detection boxes.
    # Filters out boxes smaller than MIN_BOX_PIXELS to ignore noise.
    
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
    # For each slot, check whether any centroid falls inside its polygon,
    # append the result to its rolling history, and update is_occupied.
    
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
    # Atomically write status.json to VIDEO_DIR.
    # Uses a temp file + os.replace so the Django poller never reads a
    # half-written file.    

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

    # Graceful shutdown 
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

    # Loop state
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
                if config.USE_USB_CAMERA or config.USE_PI_CAMERA:
                    # Camera read failed — could be a momentary glitch, retry
                    logger.warning("Camera read failed — retrying …")
                    time.sleep(0.1)
                    continue
                else:
                    # End of test video file — loop back to the beginning
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

            frame_count += 1
            if frame_count % config.WRITE_STATUS_EVERY == 0:
                write_status_json(slots)

            if now - last_snapshot_time >= config.SNAPSHOT_INTERVAL:
                save_snapshot(frame, slots, now)
                last_snapshot_time = now

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