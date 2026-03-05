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
        cap = cv2.VideoCapture(config.USB_CAMERA_INDEX)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  config.OUTPUT_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.OUTPUT_HEIGHT)
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
        { 'cx', 'cy', 'x1', 'y1', 'x2', 'y2', 'shapely_box' }

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

    Requires BOTH conditions to call a slot 'occupied':
      1. Vehicle centroid is inside the slot polygon
      2. Vehicle box covers >= OCCUPIED_OVERLAP_THRESHOLD of the slot area

    This dual-gate prevents large vehicles in adjacent slots from triggering
    'occupied' just because their bounding box spills over the boundary.

    A vehicle that only partially overlaps (one condition true, not both)
    is classified as 'improper' — it is touching the slot but not parked in it.

    Thresholds in config.py:
        OVERLAP_THRESHOLD          = 0.15   # min spill area → 'improper'
        OCCUPIED_OVERLAP_THRESHOLD = 0.55   # min coverage (with centroid inside) → 'occupied'
    """
    overlap_threshold  = getattr(config, 'OVERLAP_THRESHOLD',          0.15)
    occupied_threshold = getattr(config, 'OCCUPIED_OVERLAP_THRESHOLD',  0.55)

    centroid_inside = slot_poly.contains(Point(det['cx'], det['cy']))
    ratio           = _box_overlap_ratio(det, slot_poly)

    if centroid_inside and ratio >= occupied_threshold:
        # Vehicle is centred in the slot and covers most of it → occupied
        return 'occupied'
    elif ratio >= overlap_threshold:
        # Vehicle is touching/straddling the slot but not truly parked in it → improper
        return 'improper'
    else:
        return 'vacant'


def classify_slot(slot_poly: Polygon, detections: list) -> str:
    """
    Return the highest-priority status across all detections for one slot.
    Priority: occupied > improper > vacant
    """
    best = 'vacant'
    for det in detections:
        status = _slot_status_for_detection(det, slot_poly)
        if status == 'occupied':
            return 'occupied'       # short-circuit — can't do better
        if status == 'improper':
            best = 'improper'
    return best


# ── Occupancy smoothing ────────────────────────────────────────────────────────

# Per-frame status → integer weight for the rolling history buffer.
# occupied=2 dominates improper=1 so a single properly-parked car
# overrides any number of partial-overlap 'improper' readings.
_STATUS_WEIGHT = {'occupied': 2, 'improper': 1, 'vacant': 0}


def update_occupancy(slots: list, detections: list):
    """
    Smooth noisy per-frame detections using a weighted rolling history.

    Config values (add to config.py):
        SMOOTH_FRAMES       = 5    # deque maxlen — already set in slot_fetcher
        SMOOTH_THRESHOLD    = 8    # sum >= 8 → occupied  (needs ~4/5 frames occupied)
        IMPROPER_THRESHOLD  = 3    # sum >= 3 → improper  (needs ~3 consecutive improper frames)

    Why SMOOTH_THRESHOLD=8?
        Max score for 5 frames of 'occupied' (weight 2) = 10.
        Requiring 8 means at least 4 of 5 frames must detect a vehicle before
        the slot flips occupied — filters out shadows, glare, passing cars.

    Why IMPROPER_THRESHOLD=3?
        Weight 1 per frame, so 3 means 3 consecutive improper frames before
        the slot turns orange — prevents momentary boundary clips from flashing.
    """
    smooth_threshold   = getattr(config, 'SMOOTH_THRESHOLD',   8)
    improper_threshold = getattr(config, 'IMPROPER_THRESHOLD', 3)

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

        # Keep legacy boolean so any code still reading is_occupied doesn't break
        slot['is_occupied'] = slot['status'] == 'occupied'


# ── Rendering ─────────────────────────────────────────────────────────────────

# BGR colours for each status
_STATUS_COLOR = {
    'occupied': (0,   0,   255),   # red
    'improper': (0,   165, 255),   # orange
    'vacant':   (0,   255,   0),   # green
}
_STATUS_LABEL = {
    'occupied': 'Occupied',
    'improper': 'Improper',
    'vacant':   'Vacant',
}


def draw_overlays(frame: np.ndarray, slots: list) -> np.ndarray:
    for slot in slots:
        # Use 3-way status; fall back gracefully for slots not yet updated
        status = slot.get('status', 'occupied' if slot.get('is_occupied') else 'vacant')
        color  = _STATUS_COLOR[status]
        pts    = slot['pts_np']

        # Semi-transparent polygon fill
        overlay = frame.copy()
        cv2.fillPoly(overlay, [pts], color)
        cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)

        # Polygon border
        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)

        # Label centred inside the polygon with a dark backing rect for readability
        cx = int(pts[:, 0].mean())
        cy = int(pts[:, 1].mean())
        label = f"{slot['slot_label']} {_STATUS_LABEL[status]}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 2)
        cv2.rectangle(frame,
                      (cx - tw // 2 - 3, cy - th // 2 - 4),
                      (cx + tw // 2 + 3, cy + th // 2 + 4),
                      (0, 0, 0), -1)
        cv2.putText(frame, label,
                    (cx - tw // 2, cy + th // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2, cv2.LINE_AA)
    return frame


# ── Push helpers ──────────────────────────────────────────────────────────────

def push_status(slots: list):
    """POST occupancy status (with improper count) to Django."""
    data = {
        "timestamp": int(time.time()),
        "occupied":  sum(1 for s in slots if s.get('status') == 'occupied'),
        "vacant":    sum(1 for s in slots if s.get('status') == 'vacant'),
        "improper":  sum(1 for s in slots if s.get('status') == 'improper'),
        "slots": [
            {
                "id":         s["id"],
                "slot_label": s["slot_label"],
                # 'occupied' boolean kept for backward-compat with older Django views
                "occupied":   s.get('status') == 'occupied',
                "status":     s.get('status', 'vacant'),
            }
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


def push_clean_snapshot(frame: np.ndarray, now: float):
    """POST the clean (no overlay) frame to Django for the slot editor and reservation map."""
    filename = f"snapshot_{int(now)}.jpg"

    success, buf = cv2.imencode(".jpg", frame)
    if not success:
        logger.warning("push_clean_snapshot: cv2.imencode failed")
        return

    try:
        requests.post(
            f"{config.DJANGO_BASE_URL}/parking-allotment/api/upload-clean-snapshot/",
            files={"snapshot": (filename, buf.tobytes(), "image/jpeg")},
            headers={"X-API-KEY": config.UPLOAD_API_KEY},
            timeout=config.REQUEST_TIMEOUT,
        )
        logger.info("Clean snapshot pushed to Django: %s", filename)
    except Exception as exc:
        logger.warning("push_clean_snapshot failed: %s", exc)


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
            detections = get_detections(results)

            update_occupancy(slots, detections)

            clean_frame = frame.copy()
            frame       = draw_overlays(frame, slots)

            frame_count += 1
            if frame_count % config.WRITE_STATUS_EVERY == 0:
                push_status(slots)

            if now - last_snapshot_time >= config.SNAPSHOT_INTERVAL:
                push_snapshot(frame, slots, now)
                push_clean_snapshot(clean_frame, now)
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