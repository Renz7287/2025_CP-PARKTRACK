from pathlib import Path

# Django server
DJANGO_BASE_URL = "http://10.246.146.103:8000"
CAMERA_ID = 1
SLOT_POLL_INTERVAL = 30
REQUEST_TIMEOUT = 5

# Must match UPLOAD_API_KEY in Django settings.py
UPLOAD_API_KEY = "parktrack@2025"

# Video source
# USE_USB_CAMERA = True  -> USB webcam
# USE_PI_CAMERA  = True  -> Pi Camera Module (CSI)
# Both False             -> test video file
USE_PI_CAMERA  = False
USE_USB_CAMERA = True
USB_CAMERA_INDEX = 0

PROJECT_DIR = Path('/home/parktrack')
VIDEO_FILE  = PROJECT_DIR / "parktrack" / "media" / "video_stream" / "input.mp4"

# Output
OUTPUT_WIDTH  = 1280
OUTPUT_HEIGHT = 720
OUTPUT_FPS    = 5

VIDEO_DIR    = Path('/home/parktrack/stream')
SNAPSHOT_DIR = Path('/home/parktrack/stream/snapshots')

SEGMENT_PATTERN = str(VIDEO_DIR / "segment_%03d.ts")
OUTPUT_PLAYLIST = str(VIDEO_DIR / "stream.m3u8")

# Snapshots
SNAPSHOT_INTERVAL = 60
MAX_SNAPSHOTS     = 10

# YOLO
YOLO_MODEL_PATH = PROJECT_DIR / "weights" / "best.pt"
YOLO_CONFIDENCE = 0.35
MIN_BOX_PIXELS  = 10

# Occupancy smoothing
HISTORY_LEN      = max(3, OUTPUT_FPS)
SMOOTH_THRESHOLD = max(1, HISTORY_LEN // 2 + 1)

WRITE_STATUS_EVERY = 3

FFMPEG_CMD = [
    "ffmpeg",
    "-f",        "rawvideo",
    "-pix_fmt",  "bgr24",
    "-s",        f"{OUTPUT_WIDTH}x{OUTPUT_HEIGHT}",
    "-r",        str(OUTPUT_FPS),
    "-i",        "-",
    "-c:v",      "libx264",
    "-preset",   "veryfast",
    "-tune",     "zerolatency",
    "-pix_fmt",  "yuv420p",
    "-g",        str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-hls_time",          "1",
    "-hls_list_size",     "10",
    "-hls_flags",         "append_list",
    "-hls_segment_filename", SEGMENT_PATTERN,
    OUTPUT_PLAYLIST,
]