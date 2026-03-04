let hls = null;

export function initializeParkingAllotment() {

    // Section elements
    const snapshotToggle   = document.getElementById('snapshot-toggle');
    const liveToggle       = document.getElementById('live-toggle');
    const snapshotSection  = document.getElementById('snapshot-section');
    const liveSection      = document.getElementById('live-section');
    const snapshotStatus   = document.getElementById('snapshot-status');
    const statusContainer  = document.getElementById('status-container');
    const toggleContainer  = document.getElementById('toggle-container');

    let currentSection = null;

    function showSection(section) {
        document.querySelectorAll('.section-content').forEach(sec => sec.classList.add('hidden'));

        if (section === 'snapshot') {
            snapshotSection.classList.remove('hidden');
            statusContainer.classList.remove('hidden');
            toggleContainer.classList.remove('hidden');
            snapshotStatus.classList.remove('hidden');
            if (currentSection === 'live') stopStream();

        } else if (section === 'live') {
            liveSection.classList.remove('hidden');
            statusContainer.classList.add('hidden');
            toggleContainer.classList.add('hidden');
            if (currentSection !== 'live') startStream();
        }

        currentSection = section;
    }

    document.getElementById('content').addEventListener('click', (event) => {
        if (event.target.closest('#snapshot-toggle'))            showSection('snapshot');
        if (event.target.closest('#live-toggle'))                showSection('live');
        if (event.target.closest('#allotment-back-to-snapshot')) showSection('snapshot');
        if (event.target.closest('#reserve-toggle')) {
            const modal = document.getElementById('reservation-modal');
            if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        }
    });

    showSection('snapshot');

    // ── HLS Stream ────────────────────────────────────────────────────────────
    // Uses the dedicated serve_hls Django view which sets correct MIME types.
    // Django's dev server does not set the right Content-Type for .m3u8/.ts
    // files when serving them via MEDIA_URL, causing hls.js to fail.
    const VIDEO_SRC = '/parking-allotment/stream/stream.m3u8';

    function startStream() {
        const video = document.getElementById('live-video');
        if (!video) return;

        if (hls) { hls.destroy(); hls = null; }

        if (typeof Hls === 'undefined') {
            console.error('hls.js not loaded');
            return;
        }

        if (Hls.isSupported()) {
            hls = new Hls({
                liveSyncDurationCount:       6,
                liveMaxLatencyDurationCount: 10,
                maxBufferLength:             90,
                maxMaxBufferLength:          180,
                lowLatencyMode:              false,
                startFragPrefetch:           true,
                autoStartLoad:               false,
                manifestLoadingTimeOut:      20000,
                manifestLoadingMaxRetry:     12,
                manifestLoadingRetryDelay:   3000,
                levelLoadingTimeOut:         20000,
                levelLoadingMaxRetry:        12,
                levelLoadingRetryDelay:      3000,
                fragLoadingTimeOut:          40000,
                fragLoadingMaxRetry:         12,
                fragLoadingRetryDelay:       3000,
                maxStarvationDelay:          30,
                maxLoadingDelay:             30,
                nudgeMaxRetry:               15,
                nudgeOffset:                 0.3,
            });

            hls.loadSource(VIDEO_SRC);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                // Wait until 5 segments are buffered before starting playback
                // to avoid immediate stalling on slow PythonAnywhere responses
                const waitForBuffer = setInterval(() => {
                    const buffered = video.buffered.length > 0
                        ? video.buffered.end(0) - video.currentTime
                        : 0;
                    if (buffered >= 25) {
                        clearInterval(waitForBuffer);
                        hls.startLoad();
                        video.play().catch(() => {});
                    }
                }, 1000);

                // Fallback: start anyway after 40s if buffer check never passes
                setTimeout(() => {
                    clearInterval(waitForBuffer);
                    hls.startLoad();
                    video.play().catch(() => {});
                }, 40000);
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    hls.startLoad();
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                } else {
                    setTimeout(startStream, 8000);
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = VIDEO_SRC;
            video.play().catch(() => {});
        }

        startLiveOverlay();
    }

    function stopStream() {
        if (hls) { hls.destroy(); hls = null; }
        const video = document.getElementById('live-video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
        stopLiveOverlay();
    }

    // ── Live polygon overlay on video ─────────────────────────────────────────
    // Draws slot polygons + occupancy status on a canvas layered over the video.
    // Fetches slot data from the same status API the Pi pushes to, so it always
    // reflects the latest layout and detection results without restarting the Pi.

    let liveOverlayInterval = null;
    let liveSlots           = [];

    function startLiveOverlay() {
        // Fetch slots immediately then poll every 5 seconds
        fetchLiveSlots();
        if (liveOverlayInterval) clearInterval(liveOverlayInterval);
        liveOverlayInterval = setInterval(fetchLiveSlots, 5000);
    }

    function stopLiveOverlay() {
        if (liveOverlayInterval) { clearInterval(liveOverlayInterval); liveOverlayInterval = null; }
        const canvas = document.getElementById('live-overlay-canvas');
        if (canvas) { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    async function fetchLiveSlots() {
        try {
            // Get current slot layout from settings API
            const slotResp = await fetch('/settings/api/slots/?camera_id=1', { cache: 'no-store' });
            const slotData = await slotResp.json();
            if (!slotData.success) return;

            // Get current occupancy status from the Pi's push endpoint
            const statusResp = await fetch('/parking-allotment/api/parking-status/', { cache: 'no-store' });
            const statusData = await statusResp.json();

            // Merge occupancy into slots
            const occupiedLabels = new Set(
                (statusData.slots || []).filter(s => s.occupied).map(s => s.slot_label)
            );

            liveSlots = slotData.slots.map(slot => ({
                ...slot,
                is_occupied: occupiedLabels.has(slot.slot_label),
            }));

            drawLiveOverlay();
        } catch (e) {
            console.error('fetchLiveSlots failed:', e);
        }
    }

    function drawLiveOverlay() {
        const canvas = document.getElementById('live-overlay-canvas');
        const video  = document.getElementById('live-video');
        if (!canvas || !video) return;

        // Keep canvas dimensions in sync with the displayed video size
        const rect = video.getBoundingClientRect();
        canvas.width  = rect.width;
        canvas.height = rect.height;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        liveSlots.forEach(slot => {
            const pts = slot.polygon_points;
            if (!pts || pts.length < 3) return;

            const color  = slot.is_occupied ? '#ef4444' : '#22c55e';
            const fill   = slot.is_occupied ? 'rgba(239,68,68,0.20)' : 'rgba(34,197,94,0.15)';
            const label  = slot.is_occupied ? 'Occupied' : 'Vacant';

            // polygon_points are normalized [0–1], scale to canvas pixels
            ctx.beginPath();
            ctx.moveTo(pts[0][0] * canvas.width, pts[0][1] * canvas.height);
            pts.slice(1).forEach(p => ctx.lineTo(p[0] * canvas.width, p[1] * canvas.height));
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth   = 2;
            ctx.stroke();

            // Label at centroid
            const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length * canvas.width;
            const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length * canvas.height;
            ctx.fillStyle    = color;
            ctx.font         = 'bold 13px monospace';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${slot.slot_label} ${label}`, cx, cy);
        });
    }

    // Mobile parking map (pan + zoom)

    const parkingContainer = document.getElementById('parking-container');
    const parkingImage     = document.getElementById('parking-image');
    const zoomInBtn        = document.getElementById('zoom-in');
    const zoomOutBtn       = document.getElementById('zoom-out');
    const resetViewBtn     = document.getElementById('reset-view');

    if (parkingContainer && parkingImage) {
        let scale = 1, posX = 0, posY = 0;
        let isDragging = false, startX, startY;
        const isMobile = window.innerWidth < 768;

        function updateTransform() {
            parkingImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
        }
        function getDistance(t1, t2) {
            return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }

        if (isMobile) {
            let initialDistance = 0;
            parkingContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX - posX;
                    startY = e.touches[0].clientY - posY;
                } else if (e.touches.length === 2) {
                    initialDistance = getDistance(e.touches[0], e.touches[1]);
                }
            });
            parkingContainer.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 1 && isDragging) {
                    posX = e.touches[0].clientX - startX;
                    posY = e.touches[0].clientY - startY;
                } else if (e.touches.length === 2) {
                    const dist   = getDistance(e.touches[0], e.touches[1]);
                    const factor = dist / initialDistance;
                    if (Math.abs(factor - 1) > 0.1) {
                        scale = Math.min(3, Math.max(1, scale * factor));
                        initialDistance = dist;
                    }
                }
                updateTransform();
            }, { passive: false });
            parkingContainer.addEventListener('touchend', () => { isDragging = false; });
            parkingContainer.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                isDragging = true;
                startX = e.clientX - posX;
                startY = e.clientY - posY;
                parkingContainer.style.cursor = 'grabbing';
            });
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                posX = e.clientX - startX;
                posY = e.clientY - startY;
                updateTransform();
            });
            document.addEventListener('mouseup', () => {
                isDragging = false;
                parkingContainer.style.cursor = 'grab';
            });
            zoomInBtn?.addEventListener('click',    () => { scale = Math.min(scale + 0.2, 3); updateTransform(); });
            zoomOutBtn?.addEventListener('click',   () => { scale = Math.max(scale - 0.2, 1); updateTransform(); });
            resetViewBtn?.addEventListener('click', () => { scale = 1; posX = 0; posY = 0; updateTransform(); });
        }
    }

    // ── Live occupancy counter ────────────────────────────────────────────────

    async function fetchStatus() {
        try {
            const response = await fetch('/parking-allotment/api/parking-status/', { cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            const occupiedEl = document.getElementById('occupied-count');
            const vacantEl   = document.getElementById('vacant-count');
            if (occupiedEl) occupiedEl.innerText = data.occupied;
            if (vacantEl)   vacantEl.innerText   = data.vacant;
        } catch (error) {
            console.error('Failed to fetch parking status', error);
        }
    }
    fetchStatus();
    setInterval(fetchStatus, 2000);

    // ── Snapshot with countdown timer ─────────────────────────────────────────

    const snapshotImage  = document.getElementById('allotment-snapshot');
    const snapshotTimer  = document.getElementById('snapshot-timer');
    const SNAPSHOT_MS    = 60 * 1000;
    let nextSnapshotAt   = null;

    function updateSnapshotTimer() {
        if (!nextSnapshotAt) return;
        const secondsLeft = Math.max(0, Math.round((nextSnapshotAt - Date.now()) / 1000));
        const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
        const s = String(secondsLeft % 60).padStart(2, '0');
        snapshotTimer.textContent = secondsLeft === 0 ? 'Updating...' : `${m}:${s}`;
    }

    async function fetchSnapshot() {
        try {
            const response = await fetch('/parking-allotment/api/latest-snapshot/', { cache: 'no-store' });
            if (!response.ok) throw new Error(response.status);
            const data = await response.json();
            if (data.url && snapshotImage) snapshotImage.src = data.url + '?t=' + Date.now();
            const availableEl = document.getElementById('available-parking');
            if (availableEl) availableEl.innerText = data.vacant ?? '--';
            if (data.last_modified) nextSnapshotAt = data.last_modified + SNAPSHOT_MS;
        } catch (error) {
            console.error('Failed to fetch snapshot:', error);
        }
    }

    fetchSnapshot();
    setInterval(fetchSnapshot, 15 * 1000);
    setInterval(updateSnapshotTimer, 1000);
}