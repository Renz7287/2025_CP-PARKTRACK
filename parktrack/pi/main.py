import json
import logging
import os
import signal
import subprocess
import sys
import time

import cv2
import numpy as np
import requests
from shapely.geometry import Point
from ultralytics import YOLO

import config
from slot_fetcher import SlotFetcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

config.VIDEO_DIR.mkdir(parents=True, exist_ok=True)
config.SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def open_video_source():
    if config.USE_USB_CAMERA:
        cap = cv2.VideoCapture(config.USB_CAMERA_INDEX)
        source = f"USB camera (index {config.USB_CAMERA_INDEX})"
    elif config.USE_PI_CAMERA:
        gst = (
            "libcamerasrc ! "
            "video/x-raw,width={w},height={h},framerate={fps}/1 ! "
            "videoconvert ! appsink"
        ).format(w=config.OUTPUT_WIDTH, h=config.OUTPUT_HEIGHT, fps=config.OUTPUT_FPS)
        cap = cv2.VideoCapture(gst, cv2.CAP_GSTREAMER)
        source = "Pi Camera Module"
    else:
        cap = cv2.VideoCapture(str(config.VIDEO_FILE))
        source = str(config.VIDEO_FILE)

    if not cap.isOpened():
        logger.error("Cannot open video source: %s", source)
        sys.exit(1)

    logger.info("Video source opened: %s", source)
    return cap


def start_ffmpeg():
    logger.info("Starting FFmpeg (overlay stream)...")
    proc = subprocess.Popen(config.FFMPEG_CMD, stdin=subprocess.PIPE)
    logger.info("FFmpeg overlay stream started (PID %d)", proc.pid)
    return proc


def start_ffmpeg_clean():
    """Second FFmpeg process that encodes raw frames with no polygon overlays.
    Used exclusively by the layout editor's live preview."""
    logger.info("Starting FFmpeg (clean stream)...")
    proc = subprocess.Popen(config.FFMPEG_CLEAN_CMD, stdin=subprocess.PIPE)
    logger.info("FFmpeg clean stream started (PID %d)", proc.pid)
    return proc


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
        color = (0, 0, 255) if slot["is_occupied"] else (0, 255, 0)
        label = "Occupied" if slot["is_occupied"] else "Vacant"
        pts   = slot["pts_np"]
        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
        text_x = int(pts[0][0])
        text_y = int(max(pts[0][1] - 8, 10))
        cv2.putText(frame, f"{slot['slot_label']} {label}", (text_x, text_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)
    return frame


def push_status(slots: list):
    """POST occupancy status to Django so the browser can read it."""
    data = {
        "timestamp": int(time.time()),
        "occupied":  sum(1 for s in slots if s["is_occupied"]),
        "vacant":    sum(1 for s in slots if not s["is_occupied"]),
        "slots": [
            {"id": s["id"], "slot_label": s["slot_label"], "occupied": bool(s["is_occupied"])}
            for s in slots
        ],
    }
    try:
        requests.post(
            f"{config.DJANGO_BASE_URL}/parking-allotment/api/upload-status/",
            json=data,
            headers={"X-API-KEY": config.UPLOAD_API_KEY},
            timeout=config.REQUEST_TIMEOUT,
        )
    except Exception as exc:
        logger.warning("push_status failed: %s", exc)


def push_snapshot(frame: np.ndarray, slots: list, now: float):
    """POST the overlaid frame to Django for the parking allotment display."""
    filename = f"snapshot_{int(now)}.jpg"
    occupied = sum(1 for s in slots if s["is_occupied"])
    vacant   = sum(1 for s in slots if not s["is_occupied"])

    success, buf = cv2.imencode(".jpg", frame)
    if not success:
        logger.warning("push_snapshot: cv2.imencode failed")
        return

    try:
        requests.post(
            f"{config.DJANGO_BASE_URL}/parking-allotment/api/upload-snapshot/",
            files={"snapshot": (filename, buf.tobytes(), "image/jpeg")},
            data={"occupied": occupied, "vacant": vacant},
            headers={"X-API-KEY": config.UPLOAD_API_KEY},
            timeout=config.REQUEST_TIMEOUT,
        )
        logger.info("Overlaid snapshot pushed to Django: %s", filename)
    except Exception as exc:
        logger.warning("push_snapshot failed: %s", exc)


def main():
    fetcher = SlotFetcher()
    fetcher.start()

    logger.info("Loading YOLO model: %s", config.YOLO_MODEL_PATH)
    model       = YOLO(str(config.YOLO_MODEL_PATH))
    cap         = open_video_source()
    ffmpeg      = start_ffmpeg()
    ffmpeg_clean = start_ffmpeg_clean()

    def shutdown(sig=None, frame=None):
        logger.info("Shutting down...")
        fetcher.stop()
        for proc in (ffmpeg, ffmpeg_clean):
            try: proc.stdin.close()
            except Exception: pass
            try: proc.terminate()
            except Exception: pass
        cap.release()
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    frame_interval     = 1.0 / config.OUTPUT_FPS
    last_frame_time    = 0.0
    last_snapshot_time = 0.0
    frame_count        = 0

    logger.info("Detection loop started. Press Ctrl+C to stop.")

    try:
        while True:
            now = time.time()
            if now - last_frame_time < frame_interval:
                time.sleep(0.001)
                continue
            last_frame_time = now

            ret, frame = cap.read()
            if not ret:
                if config.USE_USB_CAMERA or config.USE_PI_CAMERA:
                    logger.warning("Camera read failed, retrying...")
                    time.sleep(0.1)
                    continue
                else:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

            frame = cv2.resize(frame, (config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT),
                               interpolation=cv2.INTER_LINEAR)

            slots     = fetcher.get_slots()
            results   = model(frame, conf=config.YOLO_CONFIDENCE, verbose=False)[0]
            centroids = get_centroids(results)

            update_occupancy(slots, centroids)

            # Clean frame goes to the layout editor stream before any drawing
            clean_frame = frame.copy()

            # Overlay frame goes to the parking allotment display stream
            frame = draw_overlays(frame, slots)

            frame_count += 1
            if frame_count % config.WRITE_STATUS_EVERY == 0:
                push_status(slots)

            if now - last_snapshot_time >= config.SNAPSHOT_INTERVAL:
                push_snapshot(frame, slots, now)
                last_snapshot_time = now

            try:
                ffmpeg.stdin.write(frame.tobytes())
            except BrokenPipeError:
                logger.error("FFmpeg overlay pipe closed, exiting.")
                break

            try:
                ffmpeg_clean.stdin.write(clean_frame.tobytes())
            except BrokenPipeError:
                logger.error("FFmpeg clean pipe closed, exiting.")
                break

    except KeyboardInterrupt:
        pass
    finally:
        shutdown()


if __name__ == "__main__":
    main()