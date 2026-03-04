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
from shapely.geometry import Point, Polygon, box as shapely_box
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
    if config.USE_USB_CAMERA:
        cap    = cv2.VideoCapture(config.USB_CAMERA_INDEX)
        source = f"USB camera (index {config.USB_CAMERA_INDEX})"
    elif config.USE_PI_CAMERA:
        gst = (
            "libcamerasrc ! "
            "video/x-raw,width={w},height={h},framerate={fps}/1 ! "
            "videoconvert ! appsink"
        ).format(w=config.OUTPUT_WIDTH, h=config.OUTPUT_HEIGHT, fps=config.OUTPUT_FPS)
        cap    = cv2.VideoCapture(gst, cv2.CAP_GSTREAMER)
        source = "Pi Camera Module"
    else:
        cap    = cv2.VideoCapture(str(config.VIDEO_FILE))
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
    try:
        with open(path, 'rb') as f:
            data = f.read()
        return data, hashlib.md5(data).hexdigest()
    except Exception:
        return None, None


def start_hls_uploader(local_dir, push_url, delete_url, list_url, batch_delete_url,
                        stream_type, api_key, interval=1.0):
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


# ── Detection helpers ──────────────────────────────────────────────────────────

def get_detections(yolo_results) -> list:
    """
    Extract bounding boxes from YOLO results.

    Returns a list of dicts:
        { 'cx': float, 'cy': float,
          'x1': float, 'y1': float, 'x2': float, 'y2': float,
          'shapely_box': Polygon }

    Boxes smaller than config.MIN_BOX_PIXELS on either dimension are dropped.
    """
    detections = []
    if not (hasattr(yolo_results, "boxes") and len(yolo_results.boxes) > 0):
        return detections

    xyxy = yolo_results.boxes.xyxy
    if hasattr(xyxy, "cpu"):
        xyxy = xyxy.cpu().numpy()
    else:
        xyxy = np.array(xyxy)

    for box in xyxy:
        x1, y1, x2, y2 = map(float, box[:4])
        if (x2 - x1) < config.MIN_BOX_PIXELS or (y2 - y1) < config.MIN_BOX_PIXELS:
            continue
        detections.append({
            'cx':          (x1 + x2) / 2.0,
            'cy':          (y1 + y2) / 2.0,
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            'shapely_box': shapely_box(x1, y1, x2, y2),
        })

    return detections


def _box_overlap_ratio(det: dict, slot_poly: Polygon) -> float:
    """
    Fraction of the slot polygon area covered by the vehicle bounding box.
    Returns 0.0 if the slot polygon is invalid or has no area.
    """
    if not slot_poly.is_valid or slot_poly.area == 0:
        return 0.0
    return det['shapely_box'].intersection(slot_poly).area / slot_poly.area


def _slot_status_for_detection(det: dict, slot_poly: Polygon) -> str:
    """
    Classify how a single detected vehicle relates to one slot.

    Returns one of:
        'occupied' – vehicle is solidly inside the slot
        'improper' – vehicle overlaps the slot but isn't centred inside it
                     (straddles the boundary or is at an odd angle)
        'vacant'   – vehicle has no meaningful overlap with the slot

    Thresholds (all tunable in config.py):
        OVERLAP_THRESHOLD          – minimum overlap to count as any presence  (default 0.15)
        OCCUPIED_OVERLAP_THRESHOLD – minimum overlap to count as fully parked  (default 0.40)
    """
    overlap_threshold  = getattr(config, 'OVERLAP_THRESHOLD',          0.15)
    occupied_threshold = getattr(config, 'OCCUPIED_OVERLAP_THRESHOLD',  0.40)

    # Fast path: centroid inside polygon → definitely occupied
    if slot_poly.contains(Point(det['cx'], det['cy'])):
        return 'occupied'

    # Centroid missed — check how much of the slot the box covers
    ratio = _box_overlap_ratio(det, slot_poly)

    if ratio >= occupied_threshold:
        return 'occupied'
    elif ratio >= overlap_threshold:
        return 'improper'
    else:
        return 'vacant'


def classify_slot(slot_poly: Polygon, detections: list) -> str:
    """
    Given all vehicle detections for a frame, determine the overall status
    of one parking slot.

    Priority: occupied > improper > vacant
    (An 'improper' vehicle touching the slot beats vacant but not a properly
    parked vehicle.)
    """
    best = 'vacant'
    for det in detections:
        status = _slot_status_for_detection(det, slot_poly)
        if status == 'occupied':
            return 'occupied'   # can't do better, short-circuit
        if status == 'improper':
            best = 'improper'
    return best


# ── Occupancy smoothing ────────────────────────────────────────────────────────

# Maps raw per-frame status strings to integer weights used in the history buffer.
_STATUS_WEIGHT = {'occupied': 2, 'improper': 1, 'vacant': 0}
_WEIGHT_TO_STATUS = [
    # (min_sum_threshold, status)  — evaluated in descending priority order
    # Thresholds assume a deque of length config.SMOOTH_FRAMES (default 5).
    # Adjust config.SMOOTH_THRESHOLD / config.IMPROPER_THRESHOLD as needed.
]


def update_occupancy(slots: list, detections: list):
    """
    Update each slot's smoothed status using a rolling history buffer.

    Each frame appends the raw per-frame status weight to slot['history'].
    The smoothed status is decided by summing the history:

        sum >= config.SMOOTH_THRESHOLD   → 'occupied'
        sum >= config.IMPROPER_THRESHOLD → 'improper'
        otherwise                        → 'vacant'

    Recommended config.py additions:
        SMOOTH_FRAMES       = 5    # history deque length (already used implicitly by maxlen)
        SMOOTH_THRESHOLD    = 6    # sum needed to call a slot occupied  (e.g. 3× weight-2)
        IMPROPER_THRESHOLD  = 3    # sum needed to call a slot improper  (e.g. 3× weight-1)
    """
    smooth_threshold   = getattr(config, 'SMOOTH_THRESHOLD',   6)
    improper_threshold = getattr(config, 'IMPROPER_THRESHOLD',  3)

    for slot in slots:
        raw_status = classify_slot(slot['poly'], detections)
        slot['history'].append(_STATUS_WEIGHT[raw_status])

        total = sum(slot['history'])
        if total >= smooth_threshold:
            slot['status'] = 'occupied'
        elif total >= improper_threshold:
            slot['status'] = 'improper'
        else:
            slot['status'] = 'vacant'

        # Keep legacy boolean for any code that still reads it
        slot['is_occupied'] = slot['status'] == 'occupied'


# ── Rendering ─────────────────────────────────────────────────────────────────

# BGR colours for each status
_STATUS_COLOR = {
    'occupied': (0,   0,   255),   # red
    'improper': (0,   165, 255),   # orange
    'vacant':   (0,   255,  0),    # green
}
_STATUS_LABEL = {
    'occupied': 'Occupied',
    'improper': 'Improper',
    'vacant':   'Vacant',
}


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


# ── Push helpers ──────────────────────────────────────────────────────────────

def push_status(slots: list):
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
        # Record occupancy snapshot for dashboard statistics
        requests.post(
            f"{config.DJANGO_BASE_URL}/parking-usage/api/record-occupancy/",
            json={"occupied": data["occupied"], "vacant": data["vacant"]},
            headers={"X-API-KEY": config.UPLOAD_API_KEY},
            timeout=config.REQUEST_TIMEOUT,
        )
    except Exception as exc:
        logger.warning("push_status failed: %s", exc)


def push_snapshot(frame: np.ndarray, slots: list, now: float):
    """POST the overlaid frame to Django for the parking allotment display."""
    filename = f"snapshot_{int(now)}.jpg"
    occupied = sum(1 for s in slots if s.get('status') == 'occupied')
    vacant   = sum(1 for s in slots if s.get('status') == 'vacant')
    improper = sum(1 for s in slots if s.get('status') == 'improper')

    success, buf = cv2.imencode(".jpg", frame)
    if not success:
        logger.warning("push_snapshot: cv2.imencode failed")
        return

    try:
        requests.post(
            f"{config.DJANGO_BASE_URL}/parking-allotment/api/upload-snapshot/",
            files={"snapshot": (filename, buf.tobytes(), "image/jpeg")},
            data={"occupied": occupied, "vacant": vacant, "improper": improper},
            headers={"X-API-KEY": config.UPLOAD_API_KEY},
            timeout=config.REQUEST_TIMEOUT,
        )
        logger.info("Overlaid snapshot pushed to Django: %s", filename)
    except Exception as exc:
        logger.warning("push_snapshot failed: %s", exc)


# ── Main loop ─────────────────────────────────────────────────────────────────

def main():
    fetcher = SlotFetcher()
    fetcher.start()

    logger.info("Loading YOLO model: %s", config.YOLO_MODEL_PATH)
    model        = YOLO(str(config.YOLO_MODEL_PATH))
    cap          = open_video_source()
    ffmpeg       = start_ffmpeg()
    ffmpeg_clean = start_ffmpeg_clean()

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
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

            frame = cv2.resize(frame, (config.OUTPUT_WIDTH, config.OUTPUT_HEIGHT),
                               interpolation=cv2.INTER_LINEAR)

            slots      = fetcher.get_slots()
            results    = model(frame, conf=config.YOLO_CONFIDENCE, verbose=False)[0]
            detections = get_detections(results)          # replaces get_centroids()

            update_occupancy(slots, detections)           # now uses full boxes

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