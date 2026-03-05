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

                # Find stale remote BEFORE cleaning pushed set
                stale_remote = pushed - active_segments - {'stream.m3u8'}
                if stale_remote:
                    batch_delete(stale_remote)

                # Delete local .ts files that fell off the playlist and were already uploaded
                for fpath in list(local_dir.iterdir()):
                    if fpath.suffix == '.ts' and fpath.name not in active_segments:
                        if fpath.name in pushed:
                            try:
                                fpath.unlink()
                                pushed.discard(fpath.name)
                                seen.pop(fpath.name, None)
                            except OSError:
                                pass

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


# ── Detection ──────────────────────────────────────────────────────────────────

def get_detections(yolo_results) -> list:
    """
    Extract bounding boxes from YOLO results.
    Returns list of dicts: { cx, cy, shapely_box }
    Drops boxes smaller than config.MIN_BOX_PIXELS on either side.
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
            'shapely_box': shapely_box(x1, y1, x2, y2),
        })

    return detections


def _is_slot_occupied_by(det: dict, slot_poly: Polygon) -> bool:
    """
    Returns True if either condition is met (OR logic):

      1. CENTROID inside polygon
         — vehicle is squarely parked, centroid lands inside the boundary

      2. IoU overlap >= IOU_THRESHOLD
         — vehicle body covers enough of the slot even if its centroid
           clips just outside the polygon edge (angled parking, large SUV, etc.)

    Why OR and not AND?
      AND would miss vehicles whose centroid is barely outside the polygon.
      OR catches both the clean centre-park case and the edge-clip case,
      while IOU_THRESHOLD (default 0.20) prevents false positives from
      distant vehicles whose boxes only marginally graze the slot area.

    Config:
        IOU_THRESHOLD = 0.20   # fraction of slot area that must be covered
    """
    iou_threshold = getattr(config, 'IOU_THRESHOLD', 0.20)

    # Fast path: centroid inside polygon
    if slot_poly.contains(Point(det['cx'], det['cy'])):
        return True

    # Fallback: overlap ratio
    if not slot_poly.is_valid or slot_poly.area == 0:
        return False

    overlap_ratio = det['shapely_box'].intersection(slot_poly).area / slot_poly.area
    return overlap_ratio >= iou_threshold


def slot_has_vehicle(slot_poly: Polygon, detections: list) -> bool:
    """Return True if any detection occupies this slot."""
    return any(_is_slot_occupied_by(det, slot_poly) for det in detections)


# ── Occupancy smoothing ────────────────────────────────────────────────────────

def update_occupancy(slots: list, detections: list):
    """
    Smooth per-frame detections with a rolling binary history.
    Each frame contributes 1 (vehicle present) or 0 (absent).
    Slot flips to occupied when sum >= SMOOTH_THRESHOLD.
    Max possible sum = HISTORY_LEN.
    """
    smooth_threshold = getattr(config, 'SMOOTH_THRESHOLD', 7)

    for slot in slots:
        present = slot_has_vehicle(slot['poly'], detections)
        slot['history'].append(1 if present else 0)
        slot['is_occupied'] = sum(slot['history']) >= smooth_threshold
        slot['status']      = 'occupied' if slot['is_occupied'] else 'vacant'


# ── Rendering ──────────────────────────────────────────────────────────────────

def draw_overlays(frame: np.ndarray, slots: list) -> np.ndarray:
    for slot in slots:
        color = (0, 0, 255) if slot['is_occupied'] else (0, 255, 0)
        pts   = slot['pts_np']

        # Semi-transparent fill
        overlay = frame.copy()
        cv2.fillPoly(overlay, [pts], color)
        cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)

        # Border
        cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)

        # Label centred in polygon with dark backing
        cx    = int(pts[:, 0].mean())
        cy    = int(pts[:, 1].mean())
        label = f"{slot['slot_label']} {'Occupied' if slot['is_occupied'] else 'Vacant'}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.50, 2)
        cv2.rectangle(frame,
                      (cx - tw // 2 - 3, cy - th // 2 - 4),
                      (cx + tw // 2 + 3, cy + th // 2 + 4),
                      (0, 0, 0), -1)
        cv2.putText(frame, label,
                    (cx - tw // 2, cy + th // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2, cv2.LINE_AA)
    return frame


# ── Push helpers ───────────────────────────────────────────────────────────────

def push_status(slots: list):
    """POST occupancy status to Django."""
    data = {
        "timestamp": int(time.time()),
        "occupied":  sum(1 for s in slots if s['is_occupied']),
        "vacant":    sum(1 for s in slots if not s['is_occupied']),
        "slots": [
            {
                "id":         s["id"],
                "slot_label": s["slot_label"],
                "occupied":   bool(s['is_occupied']),
                "status":     "occupied" if s['is_occupied'] else "vacant",
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
        requests.post(
            f"{config.DJANGO_BASE_URL}/parking-usage/api/record-occupancy/",
            json={"occupied": data["occupied"], "vacant": data["vacant"]},
            headers={"X-API-KEY": config.UPLOAD_API_KEY},
            timeout=config.REQUEST_TIMEOUT,
        )
    except Exception as exc:
        logger.warning("push_status failed: %s", exc)


def push_snapshot(frame: np.ndarray, slots: list, now: float):
    """POST the overlaid frame to Django."""
    filename = f"snapshot_{int(now)}.jpg"
    occupied = sum(1 for s in slots if s['is_occupied'])
    vacant   = sum(1 for s in slots if not s['is_occupied'])

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
        logger.info("Overlaid snapshot pushed: %s", filename)
    except Exception as exc:
        logger.warning("push_snapshot failed: %s", exc)


def push_clean_snapshot(frame: np.ndarray, now: float):
    """POST the clean frame to Django for the slot editor."""
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
        logger.info("Clean snapshot pushed: %s", filename)
    except Exception as exc:
        logger.warning("push_clean_snapshot failed: %s", exc)


# ── Main loop ──────────────────────────────────────────────────────────────────

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