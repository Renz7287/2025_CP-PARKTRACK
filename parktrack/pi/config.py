from pathlib import Path

# Production server URL
# LAN testing:    DJANGO_BASE_URL = "http://10.246.146.103:8000"
# PythonAnywhere: DJANGO_BASE_URL = "https://parktrack.pythonanywhere.com"
# Local:          DJANGO_BASE_URL = "http://localhost:8000"
DJANGO_BASE_URL = "https://parktrack.pythonanywhere.com"

CAMERA_ID          = 1
SLOT_POLL_INTERVAL = 30
REQUEST_TIMEOUT    = 5

UPLOAD_API_KEY = "parktrack@2025"

# Video source selection
# Pre-recorded test video: both False (default)
# USB webcam:              USE_USB_CAMERA = True
# Pi Camera Module (CSI):  USE_PI_CAMERA  = True
USE_PI_CAMERA    = False
USE_USB_CAMERA   = True
USB_CAMERA_INDEX = 0

# Local paths
PROJECT_DIR = Path('/home/parktrack')
# PROJECT_DIR = Path(__file__).resolve().parent.parent
# VIDEO_FILE  = PROJECT_DIR / "media" / "video_stream" / "input.mp4"

OUTPUT_WIDTH  = 1280
OUTPUT_HEIGHT = 720
OUTPUT_FPS    = 3

# Stream output directories
VIDEO_DIR    = Path('/home/parktrack/stream')
SNAPSHOT_DIR = Path('/home/parktrack/stream/snapshots')
# VIDEO_DIR    = PROJECT_DIR / "media" / "video_stream"
# SNAPSHOT_DIR = PROJECT_DIR / "media" / "snapshots"

SNAPSHOT_INTERVAL = 60
MAX_SNAPSHOTS     = 10

YOLO_MODEL_PATH = PROJECT_DIR / "weights" / "best.pt"
YOLO_CONFIDENCE = 0.35
MIN_BOX_PIXELS  = 10

# ── Detection thresholds ───────────────────────────────────────────────────────
# How much of the slot polygon must the vehicle box cover:
#   >= OCCUPIED_OVERLAP_THRESHOLD  AND centroid inside → 'occupied'
#   >= OVERLAP_THRESHOLD           (centroid anywhere) → 'improper'
#   <  OVERLAP_THRESHOLD                               → 'vacant'
OVERLAP_THRESHOLD          = 0.15   # min spill area to register any presence
OCCUPIED_OVERLAP_THRESHOLD = 0.55   # min coverage (centroid must also be inside)

# ── Smoothing history ──────────────────────────────────────────────────────────
# Per-frame weights: occupied=2, improper=1, vacant=0
# Rolling deque length = HISTORY_LEN frames
#
# With OUTPUT_FPS=3, HISTORY_LEN=9 covers a 3-second window.
# SMOOTH_THRESHOLD=14 means at least 7 of 9 frames must be 'occupied'
# before the slot turns red — filters shadows, pedestrians, brief glare.
#
# IMPROPER_THRESHOLD=4 means 4 consecutive 'improper' frames (weight 1 each)
# before the slot turns orange.
#
# DO NOT add any code below that recalculates or overwrites these values.
HISTORY_LEN        = 9    # frames to keep in rolling history (3 s at 3 fps)
SMOOTH_THRESHOLD   = 14   # weighted sum needed → 'occupied'  (≈7/9 frames occupied)
IMPROPER_THRESHOLD = 4    # weighted sum needed → 'improper'  (≈4/9 frames improper)

WRITE_STATUS_EVERY = 3

STREAM_PUSH_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push/"
CLEAN_STREAM_PUSH_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push-clean/"
STREAM_DELETE_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/delete/"
CLEAN_STREAM_DELETE_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/delete-clean/"
STREAM_LIST_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/list/"
CLEAN_STREAM_LIST_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/list-clean/"
STREAM_BATCH_DELETE_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/batch-delete/"
CLEAN_STREAM_BATCH_DELETE_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/batch-delete/"
CLEAN_SNAPSHOT_PUSH_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/upload-clean-snapshot/"

# FFmpeg writes HLS files locally — Python uploader thread pushes them to Django
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
    "-profile:v","baseline",
    "-level",    "3.0",
    "-pix_fmt",  "yuv420p",
    "-b:v",     "800k",
    "-maxrate", "1000k",
    "-bufsize", "1500k",
    "-g",        str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-f",        "hls",
    "-hls_time",      "2",
    "-hls_list_size", "10",
    "-hls_flags",     "delete_segments+append_list",
    "-hls_segment_type",     "mpegts",
    "-hls_segment_filename", str(VIDEO_DIR / "segment_%03d.ts"),
    str(VIDEO_DIR / "stream.m3u8"),
]

FFMPEG_CLEAN_CMD = [
    "ffmpeg",
    "-f",        "rawvideo",
    "-pix_fmt",  "bgr24",
    "-s",        f"{OUTPUT_WIDTH}x{OUTPUT_HEIGHT}",
    "-r",        str(OUTPUT_FPS),
    "-i",        "-",
    "-c:v",      "libx264",
    "-preset",   "ultrafast",
    "-tune",     "zerolatency",
    "-profile:v","baseline",
    "-level",    "3.0",
    "-pix_fmt",  "yuv420p",
    "-b:v",     "800k",
    "-maxrate", "1000k",
    "-bufsize", "1500k",
    "-g",        str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-f",        "hls",
    "-hls_time",      "2",
    "-hls_list_size", "10",
    "-hls_flags",     "delete_segments+omit_endlist",
    "-hls_segment_type",     "mpegts",
    "-hls_segment_filename", str(VIDEO_DIR / "clean_stream" / "segment_%03d.ts"),
    str(VIDEO_DIR / "clean_stream" / "stream.m3u8"),
]