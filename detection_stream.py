# detection_stream.py
import subprocess
import sys
import os
import signal
import time
from ultralytics import YOLO
import cv2
import json
import numpy as np
from shapely.geometry import Polygon, box

PROJECT_ROOT = "C:/Users/Ejay/Documents/GitHub/PARKTRACK/parktrack"
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")
LIVE_DIR = os.path.join(STATIC_DIR, "live")
os.makedirs(LIVE_DIR, exist_ok=True)

OUT_WIDTH = 1280
OUT_HEIGHT = 720
FPS = 5

model = YOLO('weights/best.pt')
with open("parking_slots.json") as f:
    slots = json.load(f)
    for slot in slots:
        slot["poly"] = Polygon(slot["polygon"])

ffmpeg_cmd = [
    "ffmpeg",
    "-y",
    "-f", "rawvideo",
    "-pix_fmt", "bgr24",
    "-s", f"{OUT_WIDTH}x{OUT_HEIGHT}",
    "-r", str(FPS),
    "-i", "-",  # read raw frames from stdin
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-b:v", "500k",  # reduce bitrate for lighter segments
    "-maxrate", "500k",
    "-bufsize", "1000k",
    "-g", str(FPS*2),
    "-sc_threshold", "0",
    "-vf", f"scale={OUT_WIDTH}:{OUT_HEIGHT}",  # ensure scaling
    "-f", "hls",
    "-hls_time", "1",
    "-hls_list_size", "6",
    "-hls_flags", "delete_segments",
    "-hls_segment_filename", os.path.join(LIVE_DIR, "segment_%03d.ts"),
    os.path.join(LIVE_DIR, "stream.m3u8")
]

print("Starting ffmpeg with command:")
print(" ".join(ffmpeg_cmd))

ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

cap = cv2.VideoCapture('Videos/parking-area.mp4')

# optionally get original size and scale
orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print("Source size:", orig_width, orig_height)

# Safe resize keeping aspect ratio to OUT_WxOUT_H
def resize_frame(frame, out_w, out_h):
    return cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_LINEAR)

MIN_OVERLAP_RATIO = 0.4

def shutdown(sig, frame_info):
    print("Shutting down detection_stream...")
    try:
        ffmpeg_proc.stdin.close()
    except Exception:
        pass
    try:
        ffmpeg_proc.terminate()
    except Exception:
        pass
    try:
        cap.release()
    except Exception:
        pass
    sys.exit(0)

signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

frame_interval = 1.0 / FPS
last_time = 0

try:
    while True:
        now = time.time()
        if now - last_time < frame_interval:
            time.sleep(0.005)
            continue
        last_time = now

        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        proc_frame = resize_frame(frame, OUT_WIDTH, OUT_HEIGHT)

        results = model(proc_frame, conf=0.4, verbose=False)[0]

        # Draw vehicle bounding boxes
        detections = []
        if hasattr(results, "boxes") and len(results.boxes) > 0:
            xyxy = results.boxes.xyxy.cpu().numpy() if hasattr(results.boxes.xyxy, 'cpu') else np.array(results.boxes.xyxy)
            cls_ids = results.boxes.cls.cpu().numpy() if hasattr(results.boxes.cls, 'cpu') else np.array(results.boxes.cls)
            for (x1, y1, x2, y2), cls_id in zip(xyxy, cls_ids):
                x1, y1, x2, y2 = map(float, (x1, y1, x2, y2))
                detections.append(box(x1, y1, x2, y2))

                # cls_name = model.names[int(cls_id)]
                # cv2.rectangle(proc_frame, (int(x1), int(y1)), (int(x2), int(y2)), (255, 200, 0), 2)
                # cv2.putText(proc_frame, cls_name, (int(x1), int(y1) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 200, 0), 1, cv2.LINE_AA)

        # Check occupancy (by overlap ratio of vehicle box inside slot)
        for slot in slots:
            slot_poly = slot["poly"]
            occupied = False
            for detection in detections:
                inter = slot_poly.intersection(detection).area
                det_area = detection.area
                if det_area <= 0:
                    continue
                overlap_ratio = inter / det_area
                if overlap_ratio >= MIN_OVERLAP_RATIO:
                    occupied = True
                    break

            # draw slot polygon and status
            pts = np.array(slot["polygon"], np.int32)
            color = (0, 255, 0) if not occupied else (0, 0, 255)
            cv2.polylines(proc_frame, [pts], True, color, 2)
            status = "Vacant" if not occupied else "Occupied"
            cv2.putText(proc_frame, status, (pts[0][0], pts[0][1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        # Write the BGR frame to ffmpeg stdin as raw bytes
        try:
            ffmpeg_proc.stdin.write(proc_frame.tobytes())
        except BrokenPipeError:
            print("ffmpeg pipe closed, exiting.")
            break

except Exception as e:
    print("Exception:", e)
finally:
    shutdown(None, None)