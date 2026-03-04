import hashlib
import json
import logging
import os
import signal
import subprocess
import sys
import threading
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
(config.VIDEO_DIR / "clean_stream").mkdir(parents=True, exist_ok=True)


def open_video_source():
    # Pre-recorded test video: set both USE_USB_CAMERA and USE_PI_CAMERA to False
    # and place your video file at the path defined by config.VIDEO_FILE.
    # USB webcam:        set USE_USB_CAMERA = True in config.py
    # Pi Camera Module:  set USE_PI_CAMERA  = True in config.py
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
    logger.info("Starting FFmpeg (clean stream)...")
    proc = subprocess.Popen(config.FFMPEG_CLEAN_CMD, stdin=subprocess.PIPE)
    logger.info("FFmpeg clean stream started (PID %d)", proc.pid)
    return proc


def _get_active_segments(m3u8_path):
    """Returns set of segment filenames currently listed in the playlist."""
    active = set()
    try:
        with open(m3u8_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.endswith('.ts'):
                    active.add(os.path.basename(line))
    except Exception:
        pass
    return active


def _read_file(path):
    """Read file into memory and return (data, md5_hash) or (None, None) on error."""
    try:
        with open(path, 'rb') as f:
            data = f.read()
        return data, hashlib.md5(data).hexdigest()
    except Exception:
        return None, None


def start_hls_uploader(local_dir, push_url, delete_url, list_url, batch_delete_url,
                        stream_type, api_key, interval=1.0):
    """
    Keeps remote HLS dir in sync with local:
    - Startup: lists remote segments and batch-deletes anything not in the
      current active playlist (cleans up leftovers from prior runs).
    - Each tick: pushes new/changed active segments, batch-deletes segments
      that have rolled out of the playlist.
    Uses batch delete to minimize round-trips to PythonAnywhere.
    """
    seen   = {}
    pushed = set()

    def fetch_remote_segments():
        try:
            resp = requests.get(list_url, headers={'X-API-KEY': api_key}, timeout=10)
            if resp.ok:
                return set(resp.json().get('files', []))
        except Exception as exc:
            logger.warning("Failed to list remote segments: %s", exc)
        return set()

    def batch_delete(names):
        if not names:
            return
        try:
            resp = requests.post(
                batch_delete_url,
                json={'files': list(names), 'stream': stream_type},
                headers={'X-API-KEY': api_key},
                timeout=15,
            )
            if resp.ok:
                result = resp.json()
                for name in result.get('deleted', []):
                    pushed.discard(name)
                    seen.pop(name, None)
                    logger.info("Batch deleted remote segment: %s", name)
                for err in result.get('errors', []):
                    logger.warning("Batch delete error: %s", err)
            else:
                logger.warning("Batch delete failed: HTTP %d", resp.status_code)
        except Exception as exc:
            logger.warning("Batch delete request failed: %s", exc)

    def startup_cleanup(active_segments):
        remote = fetch_remote_segments()
        stale  = remote - active_segments
        if stale:
            logger.info("Startup cleanup: removing %d stale remote segment(s): %s",
                        len(stale), sorted(stale))
            batch_delete(stale)
        else:
            logger.info("Startup cleanup: remote is clean, %d active segment(s)", len(remote))
        pushed.update(remote - stale)

    def loop():
        startup_done = False

        while True:
            try:
                if not local_dir.exists():
                    time.sleep(interval)
                    continue

                m3u8            = local_dir / "stream.m3u8"
                active_segments = _get_active_segments(m3u8) if m3u8.exists() else set()

                if not startup_done and m3u8.exists():
                    startup_cleanup(active_segments)
                    startup_done = True

                stale_remote = pushed - active_segments - {'stream.m3u8'}
                if stale_remote:
                    batch_delete(stale_remote)

                for fpath in list(local_dir.iterdir()):
                    if fpath.suffix == '.ts' and fpath.name not in active_segments:
                        continue
                    if fpath.suffix not in ('.m3u8', '.ts'):
                        continue

                    data, h = _read_file(fpath)
                    if data is None:
                        continue

                    if seen.get(fpath.name) == h:
                        continue

                    try:
                        resp = requests.put(
                            push_url + fpath.name,
                            data=data,
                            headers={'X-API-KEY': api_key},
                            timeout=15,
                        )
                        if resp.status_code in (200, 201, 204):
                            seen[fpath.name] = h
                            pushed.add(fpath.name)
                            logger.debug("Pushed: %s", fpath.name)
                        else:
                            logger.warning("Push rejected (%s): HTTP %d", fpath.name, resp.status_code)
                    except Exception as exc:
                        logger.warning("HLS upload failed (%s): %s", fpath.name, exc)

            except Exception as exc:
                logger.warning("HLS uploader error: %s", exc)
            time.sleep(interval)

    t = threading.Thread(target=loop, daemon=True, name="HLSUploader")
    t.start()
    return t

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
        pts   = slot["pts_np"]
        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
        text_x = int(pts[0][0])
        text_y = int(max(pts[0][1] - 8, 10))
        cv2.putText(frame, slot['slot_label'], (text_x, text_y),
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
    model        = YOLO(str(config.YOLO_MODEL_PATH))
    cap          = open_video_source()
    ffmpeg       = start_ffmpeg()
    ffmpeg_clean = start_ffmpeg_clean()

    # Upload HLS files to Django via Python requests instead of FFmpeg HTTP push
    start_hls_uploader(
        config.VIDEO_DIR,
        config.STREAM_PUSH_URL,
        config.STREAM_DELETE_URL,
        config.STREAM_LIST_URL,
        config.STREAM_BATCH_DELETE_URL,
        'overlay',
        config.UPLOAD_API_KEY,
    )
    start_hls_uploader(
        config.VIDEO_DIR / "clean_stream",
        config.CLEAN_STREAM_PUSH_URL,
        config.CLEAN_STREAM_DELETE_URL,
        config.CLEAN_STREAM_LIST_URL,
        config.CLEAN_STREAM_BATCH_DELETE_URL,
        'clean',
        config.UPLOAD_API_KEY,
    )

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
                    # Loop pre-recorded video back to the start
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

            frame = cv2.resize(frame, (config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT),
                               interpolation=cv2.INTER_LINEAR)

            slots     = fetcher.get_slots()
            results   = model(frame, conf=config.YOLO_CONFIDENCE, verbose=False)[0]
            centroids = get_centroids(results)

            update_occupancy(slots, centroids)

            clean_frame = frame.copy()
            frame       = draw_overlays(frame, slots)

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