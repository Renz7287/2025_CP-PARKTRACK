import cv2
import json
import numpy as np
import os
import signal
import subprocess
import sys
import tempfile
import time
from collections import deque
from pathlib import Path
from shapely.geometry import Polygon, box, Point
from ultralytics import YOLO

# Config
PROJECT_DIR = Path(__file__).resolve().parents[1]            
MEDIA_ROOT = PROJECT_DIR / 'parktrack' / 'media'            
VIDEO_DIR = MEDIA_ROOT / 'video_stream'
INPUT_MP4 = VIDEO_DIR / 'input.mp4'

OUT_W = 1280
OUT_H = 720
FPS = 5                         
MIN_OVERLAP_RATIO = 0.4

YOLO_MODEL = PROJECT_DIR / 'weights' / 'best.pt'           
PARKING_JSON = PROJECT_DIR / 'parking_slots.json'         

SEGMENT_PATTERN = str(VIDEO_DIR / 'segment_%03d.ts')
OUTPUT_PLAYLIST = str(VIDEO_DIR / 'stream.m3u8')

VIDEO_DIR.mkdir(parents=True, exist_ok=True)

def write_status_json(video_dir, slots):
    status = {
        'timestamp': int(time.time()),
        # 'total_slots': len(slots),
        'occupied': sum(1 for slot in slots if slot.get('is_occupied')),
        'vacant': sum(1 for slot in slots if not slot.get('is_occupied')),
        'slots': [
            {'id': slot.get('id', None), 'occupied': bool(slot.get('is_occupied'))}
            for slot in slots
        ],
    }

    tmp_fd, tmp_path = tempfile.mkstemp(dir=str(video_dir))

    try:
        with os.fdopen(tmp_fd, 'w') as tmpf:
            json.dump(status, tmpf)
            tmpf.flush()
            os.fsync(tmpf.fileno())

        final_path = os.path.join(video_dir, 'status.json')
        os.replace(tmp_path, final_path)
    except Exception as e:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        print('Failed to write status.json: ', e)

model = YOLO(str(YOLO_MODEL))

with open(PARKING_JSON, 'r') as file:
    slots = json.load(file)

HISTORY_LEN = max(3, int(FPS))  # Keep a history of the last N frames. example: 3 frames or FPS if FPS is higher

for slot in slots:
    slot['poly'] = Polygon(slot['polygon'])
    slot['pts_np'] = np.array(slot['polygon'], dtype=np.int32)
    slot['history'] = deque(maxlen=HISTORY_LEN)  # Stores booleans, True if centroid inside
    slot['is_occupied'] = False

ffmpeg_cmd = [
    'ffmpeg',
    '-re',                          
    '-f', 'rawvideo',
    '-pix_fmt', 'bgr24',
    '-s', f'{OUT_W}x{OUT_H}',
    '-r', str(FPS),
    '-i', '-',                     
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-g', str(FPS * 2),
    '-hls_time', '2',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', SEGMENT_PATTERN,
    OUTPUT_PLAYLIST
]

print('FFmpeg command:', ' '.join(ffmpeg_cmd))

ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)

cap = cv2.VideoCapture(str(INPUT_MP4))

if not cap.isOpened():
    print('Error cannot open input video.', INPUT_MP4)
    ffmpeg_proc.stdin.close()
    ffmpeg_proc.terminate()
    sys.exit(1)

def shutdown(sig=None, frame=None):
    print('Shutting down overlay_and_stream...')
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

print('Starting overlay+stream loop. Press Ctrl+C to stop.')

loop_count = 0

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

        centroids = []
        if hasattr(results, 'boxes') and len(results.boxes) > 0:
            xyxy = results.boxes.xyxy
            if hasattr(xyxy, 'cpu'):
                xyxy = xyxy.cpu().numpy()
            else:
                xyxy = np.array(xyxy)
            for box_xy in xyxy:
                x1, y1, x2, y2 = map(float, box_xy[:4])

                # Filter out tiny boxes (Optional)
                box_w = x2 - x1
                box_h = y2 - y1
                if box_w < 10 or box_h < 10:
                    continue

                # Computes centroid
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                centroids.append((cx, cy))

                # Draw centroid and box (Optional)
                # cv2.circle(frame, (int(cx), int(cy)), 3, (255,200,0), -1)
                # cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (255,200,0), 1)

        # Check if any centroid falls inside the polygon per parking slot
        # and update short history -> then decide occupancy by threshold
        SMOOTH_THRESHOLD = max(1, HISTORY_LEN // 2 + 1)
        for slot in slots:
            slot_poly = slot['poly']

            # Check centroids inside slot
            present = False
            for (cx, cy) in centroids:
                point = Point(cx, cy)
                if slot_poly.contains(point):
                    present = True
                    break

            slot['history'].append(1 if present else 0)

            occ_count = sum(slot['history'])
            slot['is_occupied'] = occ_count >= SMOOTH_THRESHOLD

            # Draws polygon and label
            pts = slot['pts_np']
            color = (0, 255, 0) if not slot['is_occupied'] else (0, 0, 255)
            cv2.polylines(frame, [pts], isClosed=True, color=color, thickness=2)
            status = 'Vacant' if not slot['is_occupied'] else 'Occupied'
            text_pos = (int(pts[0][0]), int(max(pts[0][1] - 8, 10)))
            cv2.putText(frame, status, text_pos, cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2, cv2.LINE_AA)

        try:
            WRITE_EVERY = 3  # Set to 3 or 5 for less frequent writes

            loop_count += 1
            if loop_count % WRITE_EVERY == 0:
                try:
                    write_status_json(VIDEO_DIR, slots)
                except Exception as e:
                    print('Error writing status.json:', e)

            ffmpeg_proc.stdin.write(frame.tobytes())
        except BrokenPipeError:
            print('FFmpeg pipe closed. Exiting.')
            break

except KeyboardInterrupt:
    shutdown()
except Exception as e:
    print('Exception', e)
    shutdown()