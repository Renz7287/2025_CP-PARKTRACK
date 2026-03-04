from pathlib import Path

# Production server URL — update this when deploying
# LAN testing:  DJANGO_BASE_URL = "http://10.246.146.103:8000"
# Deployed:
DJANGO_BASE_URL = "https://parktrack-tu17.onrender.com/"
# DJANGO_BASE_URL = "http://localhost:8000"

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

OUTPUT_WIDTH  = 1280
OUTPUT_HEIGHT = 720
OUTPUT_FPS    = 5

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

# HLS push endpoints on the Django server
# FFmpeg pushes segments via HTTP PUT instead of writing to local disk,
# so segments land directly on the server's persistent storage.
STREAM_PUSH_URL       = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push/"
CLEAN_STREAM_PUSH_URL = f"{DJANGO_BASE_URL}/parking-allotment/api/stream/push-clean/"

# Overlay stream — includes polygon and detection status drawn on each frame.
# delete_segments removes .ts files that fall off the playlist window automatically.
FFMPEG_CMD = [
    "ffmpeg",
    "-f",       "rawvideo",
    "-pix_fmt", "bgr24",
    "-s",       f"{OUTPUT_WIDTH}x{OUTPUT_HEIGHT}",
    "-r",       str(OUTPUT_FPS),
    "-i",       "-",
    "-c:v",     "libx264",
    "-preset",  "veryfast",
    "-tune",    "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g",       str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-f",       "hls",
    "-hls_time",     "2",
    "-hls_list_size","10",
    "-hls_flags",    "delete_segments+append_list",
    "-hls_segment_type", "mpegts",
    "-headers",  f"X-API-KEY: {UPLOAD_API_KEY}\r\n",
    "-method",   "PUT",
    "-hls_segment_filename", f"{STREAM_PUSH_URL}segment-%03d.ts",
    f"{STREAM_PUSH_URL}stream.m3u8",
]

# Clean stream — no overlays, used only by the layout editor live preview.
# Keeps only 3 segments on disk since it is a single-admin preview feed.
FFMPEG_CLEAN_CMD = [
    "ffmpeg",
    "-f",       "rawvideo",
    "-pix_fmt", "bgr24",
    "-s",       f"{OUTPUT_WIDTH}x{OUTPUT_HEIGHT}",
    "-r",       str(OUTPUT_FPS),
    "-i",       "-",
    "-c:v",     "libx264",
    "-preset",  "ultrafast",
    "-tune",    "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g",       str(OUTPUT_FPS),
    "-sc_threshold", "0",
    "-f",       "hls",
    "-hls_time",     "2",
    "-hls_list_size","3",
    "-hls_flags",    "delete_segments+omit_endlist",
    "-hls_segment_type", "mpegts",
    "-headers",  f"X-API-KEY: {UPLOAD_API_KEY}\r\n",
    "-method",   "PUT",
    "-hls_segment_filename", f"{CLEAN_STREAM_PUSH_URL}segment-%03d.ts",
    f"{CLEAN_STREAM_PUSH_URL}stream.m3u8",
]