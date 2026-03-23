from pathlib import Path

# Server URL options: LAN, PythonAnywhere, or localhost
DJANGO_BASE_URL = "https://parktrack.pythonanywhere.com"

CAMERA_ID          = 1
SLOT_POLL_INTERVAL = 30
REQUEST_TIMEOUT    = 5

UPLOAD_API_KEY = "parktrack@2025"

# Video source: set one to True to use a live camera, both False to use VIDEO_FILE
USE_PI_CAMERA    = False
USE_USB_CAMERA   = True
USB_CAMERA_INDEX = 0

PROJECT_DIR = Path('/home/parktrack')  # production Pi path
# PROJECT_DIR = Path(__file__).resolve().parent.parent
# VIDEO_FILE  = PROJECT_DIR / "media" / "video_stream" / "input.webm"

OUTPUT_WIDTH  = 1280
OUTPUT_HEIGHT = 720
OUTPUT_FPS    = 3

VIDEO_DIR    = Path('/home/parktrack/stream')       # production Pi path
SNAPSHOT_DIR = Path('/home/parktrack/stream/snapshots')
# VIDEO_DIR    = PROJECT_DIR / "media" / "video_stream"
# SNAPSHOT_DIR = PROJECT_DIR / "media" / "snapshots"

SNAPSHOT_INTERVAL = 60
MAX_SNAPSHOTS     = 10

YOLO_MODEL_PATH = PROJECT_DIR / "weights" / "best.pt"
YOLO_CONFIDENCE = 0.65
MIN_BOX_PIXELS  = 10

# Smoothing: each frame appends 1 (vehicle present) or 0 (absent) to a rolling buffer.
# At OUTPUT_FPS=3, HISTORY_LEN=9 covers a 3-second window.
# SMOOTH_THRESHOLD=7 requires 7 of the last 9 frames to detect a vehicle before
# flipping a slot occupied — reduces false positives from shadows or pedestrians.
HISTORY_LEN      = 9   # rolling buffer length (3s at 3fps)
SMOOTH_THRESHOLD = 7   # frames needed to flip occupied (≈7/9)
IMPROPER_PARK_THRESHOLD = 0.5

# Minimum fraction of slot area a vehicle box must overlap to trigger improper
# when its centroid is outside the polygon. Raise to reduce false positives.
IMPROPER_OVERLAP_THRESHOLD = 0.25

WRITE_STATUS_EVERY = 3

STREAM_PUSH_URL               = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push/"
CLEAN_STREAM_PUSH_URL         = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push-clean/"
STREAM_DELETE_URL             = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/delete/"
CLEAN_STREAM_DELETE_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/delete-clean/"
STREAM_LIST_URL               = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/list/"
CLEAN_STREAM_LIST_URL         = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/list-clean/"
STREAM_BATCH_DELETE_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/batch-delete/"
CLEAN_STREAM_BATCH_DELETE_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/batch-delete/"
CLEAN_SNAPSHOT_PUSH_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/upload-clean-snapshot/"

# FFmpeg writes HLS segments locally; the uploader thread pushes them to Django
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
    "-b:v",      "800k",
    "-maxrate",  "1000k",
    "-bufsize",  "1500k",
    "-g",        str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-f",        "hls",
    "-hls_time",      "2",
    "-hls_list_size", "10",
    "-hls_flags",     "append_list",
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
    "-b:v",      "800k",
    "-maxrate",  "1000k",
    "-bufsize",  "1500k",
    "-g",        str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-f",        "hls",
    "-hls_time",      "2",
    "-hls_list_size", "10",
    "-hls_flags",     "omit_endlist",
    "-hls_segment_type",     "mpegts",
    "-hls_segment_filename", str(VIDEO_DIR / "clean_stream" / "segment_%03d.ts"),
    str(VIDEO_DIR / "clean_stream" / "stream.m3u8"),
]