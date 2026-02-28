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

    // HLS Stream

    const VIDEO_SRC = '/stream/stream.m3u8';

    function startStream() {
        const video = document.getElementById('live-video');
        if (!video) return;

        if (hls) { hls.destroy(); hls = null; }

        if (typeof Hls === 'undefined') {
            console.error('hls.js not loaded — check your base template includes the hls.js script tag');
            return;
        }

        if (Hls.isSupported()) {
            hls = new Hls({
                liveSyncDurationCount:       3,
                liveMaxLatencyDurationCount: 6,
                maxBufferLength:             10,
                maxMaxBufferLength:          10,
                lowLatencyMode:              false,
                startFragPrefetch:           true,
            });

            hls.loadSource(VIDEO_SRC);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    setTimeout(() => hls && hls.startLoad(), 3000);
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                } else {
                    setTimeout(startStream, 5000);
                }
            });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = VIDEO_SRC;
            video.play().catch(() => {});
        }
    }

    function stopStream() {
        if (hls) { hls.destroy(); hls = null; }
        const video = document.getElementById('live-video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }
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
            document.getElementById('occupied-count').innerText = data.occupied;
            document.getElementById('vacant-count').innerText   = data.vacant;
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
            if (data.url) snapshotImage.src = data.url + '?t=' + Date.now();
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