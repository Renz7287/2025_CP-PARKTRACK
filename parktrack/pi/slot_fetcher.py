import config
import logging
import numpy as np
import requests
import time
import threading
from collections import deque
from shapely.geometry import Polygon

logger = logging.getLogger(__name__)

def _build_slot(api_slot: dict, width: int, height: int) -> dict:
    norm_points = api_slot["polygon_points"]   

    pixel_points = [
        [round(nx * width), round(ny * height)]
        for nx, ny in norm_points
    ]

    return {
        "id": api_slot["id"],
        "slot_label": api_slot["slot_label"],
        # Shapely polygon — used for point-in-polygon centroid checks
        "poly": Polygon(pixel_points),
        # NumPy array — used by OpenCV for drawing
        "pts_np": np.array(pixel_points, dtype=np.int32),
        # Rolling occupancy history (filled by main.py)
        "history": deque(maxlen=config.HISTORY_LEN),
        "is_occupied": False,
    }


class SlotFetcher:
    def __init__(self, width: int = config.OUTPUT_WIDTH, height: int = config.OUTPUT_HEIGHT):
        self._width   = width
        self._height  = height
        self._slots   = []
        self._lock    = threading.Lock()
        self._stop    = threading.Event()
        self._thread  = threading.Thread(target=self._poll_loop, daemon=True, name="SlotFetcher")

    # Public API
    def start(self):
        # Fetch slots once immediately (blocking), then start background polling.
        logger.info("SlotFetcher: initial fetch …")
        self._fetch()
        self._thread.start()
        logger.info("SlotFetcher: background polling started (every %ds)", config.SLOT_POLL_INTERVAL)

    def stop(self):
        # Signal the background thread to stop and wait for it to exit.
        self._stop.set()
        self._thread.join(timeout=config.REQUEST_TIMEOUT + 1)
        logger.info("SlotFetcher: stopped")

    def get_slots(self) -> list:
        # Return the latest slot list. Thread-safe.
        with self._lock:
            return self._slots

    # Internal
    def _poll_loop(self):
        # Background thread: re-fetch every SLOT_POLL_INTERVAL seconds.
        while not self._stop.wait(timeout=config.SLOT_POLL_INTERVAL):
            self._fetch()

    def _fetch(self):
        url = f"{config.DJANGO_BASE_URL}/settings/api/slots/?camera_id={config.CAMERA_ID}"
        try:
            response = requests.get(url, timeout=config.REQUEST_TIMEOUT)
            response.raise_for_status()
            data = response.json()

            if not data.get("success"):
                logger.warning("SlotFetcher: API returned success=false: %s", data.get("error"))
                return

            new_slots = [
                _build_slot(s, self._width, self._height)
                for s in data.get("slots", [])
            ]

            with self._lock:
                # Preserve occupancy history for slots that already exist so
                # a background refresh doesn't reset the smoothing window.
                existing = {s["id"]: s for s in self._slots}
                for slot in new_slots:
                    if slot["id"] in existing:
                        slot["history"]     = existing[slot["id"]]["history"]
                        slot["is_occupied"] = existing[slot["id"]]["is_occupied"]
                self._slots = new_slots

            logger.info("SlotFetcher: loaded %d slot(s) for camera %d", len(new_slots), config.CAMERA_ID)

        except requests.RequestException as exc:
            logger.warning("SlotFetcher: request failed (%s) — keeping previous slots", exc)
        except Exception as exc:
            logger.exception("SlotFetcher: unexpected error: %s", exc)