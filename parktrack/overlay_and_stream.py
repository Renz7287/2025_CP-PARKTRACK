import os
import time
import json
import subprocess
import signal
import sys
from pathlib import Path
import cv2
import numpy as np
from shapely.geometry import Polygon, box
from ultralytics import YOLO

# Config
PROJECT_DIR = Path(__file__).resolve().parents[1]            
MEDIA_ROOT = PROJECT_DIR / "parktrack" / "media"            
VIDEO_DIR = MEDIA_ROOT / "video_stream"
INPUT_MP4 = VIDEO_DIR / "input.mp4"
OUT_W = 1280
OUT_H = 720
FPS = 5                         
MIN_OVERLAP_RATIO = 0.4
YOLO_MODEL = PROJECT_DIR / "weights" / "best.pt"           
PARKING_JSON = PROJECT_DIR / "parking_slots.json"         

SEGMENT_PATTERN = str(VIDEO_DIR / "segment_%03d.ts")
OUTPUT_PLAYLIST = str(VIDEO_DIR / "stream.m3u8")

VIDEO_DIR.mkdir(parents=True, exist_ok=True)

model = YOLO(str(YOLO_MODEL))

with open(PARKING_JSON, "r") as f:
    slots = json.load(f)

for s in slots:
    s["poly"] = Polygon(s["polygon"])
    s["pts_np"] = np.array(s["polygon"], dtype=np.int32)


ffmpeg_cmd = [
    "ffmpeg",
    "-re",                          # simulate real-time
    "-f", "rawvideo",
    "-pix_fmt", "bgr24",
    "-s", f"{OUT_W}x{OUT_H}",
    "-r", str(FPS),
    "-i", "-",                     
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", str(FPS * 2),
    "-hls_time", "2",
    "-hls_list_size", "6",
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_filename", SEGMENT_PATTERN,
    OUTPUT_PLAYLIST
]

print("FFmpeg command:", " ".join(ffmpeg_cmd))

ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

cap = cv2.VideoCapture(str(INPUT_MP4))
if not cap.isOpened():
    print("ERROR: cannot open input video:", INPUT_MP4)
    ffmpeg_proc.stdin.close()
    ffmpeg_proc.terminate()
    sys.exit(1)

def shutdown(sig=None, frame=None):
    print("Shutting down overlay_and_stream...")
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
last_time = 0.0

print("Starting overlay+stream loop. Press Ctrl+C to stop.")
try:
    while True:
        now = time.time()
        if now - last_time < frame_interval:
            time.sleep(0.001)
            continue
        last_time = now

        ret, frame = cap.read()
        if not ret:
            # Loop the video like a live camera
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        # Resize to desired output size (preserve aspect by simple resize)
        frame = cv2.resize(frame, (OUT_W, OUT_H), interpolation=cv2.INTER_LINEAR)

        results = model(frame, conf=0.35, verbose=False)[0]

        detections = []
        if hasattr(results, "boxes") and len(results.boxes) > 0:
            # xyxy might be torch tensors or numpy
            xyxy = results.boxes.xyxy
            if hasattr(xyxy, "cpu"):
                xyxy = xyxy.cpu().numpy()
            else:
                xyxy = np.array(xyxy)
            for box_xy in xyxy:
                x1, y1, x2, y2 = map(float, box_xy[:4])
                detections.append(box(x1, y1, x2, y2))
                
                # Optionally draw vehicle box (comment/uncomment)
                # cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (255, 200, 0), 2)

        # compute occupancy per slot and draw polygons + status
        for s in slots:
            slot_poly = s["poly"]
            occupied = False
            for det in detections:
                inter = slot_poly.intersection(det).area
                det_area = det.area
                if det_area <= 0:
                    continue
                if (inter / det_area) >= MIN_OVERLAP_RATIO:
                    occupied = True
                    break

            pts = s["pts_np"]
            color = (0, 255, 0) if not occupied else (0, 0, 255)
            # fill or outline
            cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
            # status text
            status = "Vacant" if not occupied else "Occupied"
            # place text near first point of polygon
            text_pos = (int(pts[0][0]), int(max(pts[0][1] - 8, 10)))
            cv2.putText(frame, status, text_pos, cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)

        try:
            ffmpeg_proc.stdin.write(frame.tobytes())
        except BrokenPipeError:
            print("FFmpeg pipe closed. Exiting.")
            break

except KeyboardInterrupt:
    shutdown()
except Exception as e:
    print("Exception", e)
    shutdown()