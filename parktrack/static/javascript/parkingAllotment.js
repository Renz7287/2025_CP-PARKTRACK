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
    const VIDEO_SRC = '/parking-allotment/stream/stream.m3u8';

    function startStream() {
        const video = document.getElementById('live-video');
        if (!video) return;

        if (hls) { hls.destroy(); hls = null; }

        if (typeof Hls === 'undefined') {
            console.error('hls.js not loaded');
            return;
        }

        // Inject once — hides the native browser buffering spinner
        if (!document.getElementById('hls-no-spinner')) {
            const s = document.createElement('style');
            s.id          = 'hls-no-spinner';
            s.textContent = `
                #live-video::-webkit-media-controls-overlay-play-button { display: none !important; }
                #live-video::-webkit-media-controls-start-playback-button { display: none !important; }
            `;
            document.head.appendChild(s);
        }

        if (Hls.isSupported()) {
            hls = new Hls({
                liveSyncDurationCount:       3,
                liveMaxLatencyDurationCount: 6,
                maxBufferLength:             15,
                maxMaxBufferLength:          30,
                lowLatencyMode:              false,
                startFragPrefetch:           true,
                autoStartLoad:               true,
                manifestLoadingTimeOut:      10000,
                manifestLoadingMaxRetry:     6,
                manifestLoadingRetryDelay:   2000,
                levelLoadingTimeOut:         10000,
                levelLoadingMaxRetry:        6,
                levelLoadingRetryDelay:      2000,
                fragLoadingTimeOut:          20000,
                fragLoadingMaxRetry:         6,
                fragLoadingRetryDelay:       2000,
                maxStarvationDelay:          10,
                maxLoadingDelay:             10,
                nudgeMaxRetry:               5,
                nudgeOffset:                 0.2,
            });

            hls.loadSource(VIDEO_SRC);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    setTimeout(() => hls.startLoad(), 2000);
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

    // ── Live occupancy counter ────────────────────────────────────────────────

    async function fetchStatus() {
        try {
            const response = await fetch('/parking-allotment/api/parking-status/', { cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            const occupiedEl = document.getElementById('occupied-count');
            const vacantEl   = document.getElementById('vacant-count');
            const improperEl = document.getElementById('improper-count');
            if (occupiedEl) occupiedEl.innerText = data.occupied ?? 0;
            if (vacantEl)   vacantEl.innerText   = data.vacant   ?? 0;
            if (improperEl) improperEl.innerText  = data.improper ?? 0;
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
            const improperEl  = document.getElementById('improper-parking');
            if (availableEl) availableEl.innerText = data.vacant   ?? '--';
            if (improperEl)  improperEl.innerText  = data.improper ?? '--';
            if (data.last_modified) nextSnapshotAt = data.last_modified + SNAPSHOT_MS;
        } catch (error) {
            console.error('Failed to fetch snapshot:', error);
        }
    }

    fetchSnapshot();
    setInterval(fetchSnapshot, 15 * 1000);
    setInterval(updateSnapshotTimer, 1000);
}