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
USE_USB_CAMERA   = False
USB_CAMERA_INDEX = 0

# Local paths — update commented lines when running on Pi
# PROJECT_DIR = Path('/home/parktrack')
PROJECT_DIR = Path(__file__).resolve().parent.parent
VIDEO_FILE  = PROJECT_DIR / "media" / "video_stream" / "input.mp4"

OUTPUT_WIDTH  = 640
OUTPUT_HEIGHT = 360
OUTPUT_FPS    = 3

# Stream output directories — update commented lines when running on Pi
# VIDEO_DIR    = Path('/home/parktrack/stream')
# SNAPSHOT_DIR = Path('/home/parktrack/stream/snapshots')
VIDEO_DIR    = PROJECT_DIR / "media" / "video_stream"
SNAPSHOT_DIR = PROJECT_DIR / "media" / "snapshots"

SNAPSHOT_INTERVAL = 60
MAX_SNAPSHOTS     = 10

YOLO_MODEL_PATH = PROJECT_DIR / "weights" / "best.pt"
YOLO_CONFIDENCE = 0.35
MIN_BOX_PIXELS  = 10

HISTORY_LEN      = max(3, OUTPUT_FPS)
SMOOTH_THRESHOLD = max(1, HISTORY_LEN // 2 + 1)

WRITE_STATUS_EVERY = 3

STREAM_PUSH_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push/"
CLEAN_STREAM_PUSH_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push-clean/"
STREAM_DELETE_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/delete/"
CLEAN_STREAM_DELETE_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/delete-clean/"
STREAM_LIST_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/list/"
CLEAN_STREAM_LIST_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/list-clean/"
STREAM_BATCH_DELETE_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/batch-delete/"
CLEAN_STREAM_BATCH_DELETE_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/batch-delete/"

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
    "-b:v",      "300k",
    "-maxrate",  "400k",
    "-bufsize",  "800k",
    "-g",        str(OUTPUT_FPS * 6),
    "-sc_threshold", "0",
    "-f",        "hls",
    "-hls_time",      "6",
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
    "-b:v",      "200k",
    "-maxrate",  "300k",
    "-bufsize",  "600k",
    "-g",        str(OUTPUT_FPS * 6),
    "-sc_threshold", "0",
    "-f",        "hls",
    "-hls_time",      "6",
    "-hls_list_size", "10",
    "-hls_flags",     "delete_segments+omit_endlist",
    "-hls_segment_type",     "mpegts",
    "-hls_segment_filename", str(VIDEO_DIR / "clean_stream" / "segment_%03d.ts"),
    str(VIDEO_DIR / "clean_stream" / "stream.m3u8"),
]