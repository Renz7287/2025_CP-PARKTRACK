from pathlib import Path

# Base URL of your Django server, reachable from the Pi's network.
# Development (same machine):  "http://localhost:8000"
DJANGO_BASE_URL = "http://192.168.0.227:8000"

# The camera ID assigned to this Pi in the ParkTrack admin.
# Find it in Settings → Parking Slot Management → Manage Cameras.
CAMERA_ID = 1

# How often (seconds) to re-fetch slot polygons from Django in the background.
# Changes made in the admin UI are picked up automatically within this window.
SLOT_POLL_INTERVAL = 30

REQUEST_TIMEOUT = 5

# Set to True when the physical Pi camera (picamera2) is connected.
# Set to False to use a local test video file instead.
# USE_PI_CAMERA = True   → Pi Camera Module (CSI ribbon cable)
# USE_PI_CAMERA = False  → test video file (VIDEO_FILE below)
# USE_USB_CAMERA = True  → USB webcam plugged into the Pi
USE_PI_CAMERA  = False
USE_USB_CAMERA = False

USB_CAMERA_INDEX = 0

PROJECT_DIR = Path(__file__).resolve().parents[1]
VIDEO_FILE   = PROJECT_DIR / "parktrack" / "media" / "video_stream" / "input.mp4"

OUTPUT_WIDTH  = 1280
OUTPUT_HEIGHT = 720
OUTPUT_FPS    = 5

MEDIA_ROOT      = PROJECT_DIR / "parktrack" / "media"
VIDEO_DIR       = MEDIA_ROOT / "video_stream"
SNAPSHOT_DIR    = VIDEO_DIR / "snapshots"

SEGMENT_PATTERN = str(VIDEO_DIR / "segment_%03d.ts")
OUTPUT_PLAYLIST = str(VIDEO_DIR / "stream.m3u8")

SNAPSHOT_INTERVAL = 60   # seconds between automatic snapshots
MAX_SNAPSHOTS     = 10   # older snapshots beyond this count are deleted

YOLO_MODEL_PATH = PROJECT_DIR / "weights" / "best.pt"
YOLO_CONFIDENCE = 0.35
MIN_BOX_PIXELS  = 10     # ignore detections smaller than this in px

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
    "-g",        str(OUTPUT_FPS),        # 1 keyframe per second
    "-sc_threshold", "0",               # disable scene-cut keyframes for stable segments
    "-hls_time",          "1",          # 1-second segments = faster start
    "-hls_list_size",     "10",         # keep 10 segments in playlist
    "-hls_flags",         "append_list",
    "-hls_segment_filename",  SEGMENT_PATTERN,
    OUTPUT_PLAYLIST,
]