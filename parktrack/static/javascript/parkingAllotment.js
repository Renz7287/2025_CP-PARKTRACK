let hls;

export function initializeParkingAllotment() {
    const carToggle = document.getElementById('car-toggle');
    const liveToggle = document.getElementById('live-toggle');
    
    const carSection = document.getElementById('car-section');
    const liveSection = document.getElementById('live-section');
    
    const carStatus = document.getElementById('car-status');
    const statusContainer = document.getElementById('status-container');
    const toggleContainer = document.getElementById('toggle-container');
    
    function showSection(section) {
        document.querySelectorAll('.section-content').forEach(sec => {
            sec.classList.add('hidden');
        });
    
        
        if (section === 'car') {
            carSection.classList.remove('hidden');
            statusContainer.classList.remove('hidden');
            toggleContainer.classList.remove('hidden');
            carStatus.classList.remove('hidden');
        } else if (section === 'live') {
            liveSection.classList.remove('hidden');
            statusContainer.classList.add('hidden');
            toggleContainer.classList.add('hidden');
        }
    }

    document.getElementById('content').addEventListener('click', (event) => {
        if (event.target.closest('#car-toggle')) {
            showSection('car');
        } 
        if (event.target.closest('#live-toggle')) {
            showSection('live');
        } 
        if (event.target.closest('#back-to-car')) {
            showSection('car');
        }
    });

    showSection('car');

    const video = document.getElementById('video');
    const videoSrc = '/media/video_stream/stream.m3u8';

    if (!video) return;

    if (Hls.isSupported()) {

        if(!hls) {
            hls = new Hls({
                liveSyncDuration: 2,
                liveMaxLatencyDuration: 8, // buffer
            });
    
            hls.loadSource(videoSrc);
        }
        
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.muted = true;
            video.play();
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
            if (video.paused) {
                video.play();
            }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;

                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;

                    default:
                        hls.destroy();
                        break;
                }
            }
        });
        
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoSrc;
        video.muted = true,
        video.play();
    }

    // Mobile interactive parking map functionality
    const parkingContainer = document.getElementById('parking-container');
    const parkingImage = document.getElementById('parking-image');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetViewBtn = document.getElementById('reset-view');
    
    if (parkingContainer && parkingImage) {
        let scale = 1;
        let posX = 0;
        let posY = 0;
        let isDragging = false;
        let startX, startY;
        
        
        const isMobile = window.innerWidth < 768;
        
        // mobile interactive features
        if (isMobile) {
            
            parkingContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX - posX;
                    startY = e.touches[0].clientY - posY;
                    parkingContainer.style.cursor = 'grabbing';
                }
            });
            
            parkingContainer.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                if (e.touches.length === 1) {
                    e.preventDefault();
                    posX = e.touches[0].clientX - startX;
                    posY = e.touches[0].clientY - startY;
                    updateTransform();
                }
            });
            
            parkingContainer.addEventListener('touchend', () => {
                isDragging = false;
                parkingContainer.style.cursor = 'grab';
            });
            
           
            parkingContainer.addEventListener('mousedown', (e) => {
                if (e.button === 0) { 
                    isDragging = true;
                    startX = e.clientX - posX;
                    startY = e.clientY - posY;
                    parkingContainer.style.cursor = 'grabbing';
                }
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
            
            // zoom
            zoomInBtn.addEventListener('click', () => {
                scale = Math.min(scale + 0.2, 3); // Max
                updateTransform();
            });
            
            zoomOutBtn.addEventListener('click', () => {
                scale = Math.max(scale - 0.2, 1); // Min 
                updateTransform();
            });
            
            resetViewBtn.addEventListener('click', () => {
                scale = 1;
                posX = 0;
                posY = 0;
                updateTransform();
            });
            
            // Pinch to zoom 
            let initialDistance = 0;
            
            parkingContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    initialDistance = getDistance(e.touches[0], e.touches[1]);
                }
            });
            
            parkingContainer.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const currentDistance = getDistance(e.touches[0], e.touches[1]);
                    const zoomFactor = currentDistance / initialDistance;
                    
                    if (zoomFactor > 1.1 || zoomFactor < 0.9) {
                        scale *= zoomFactor;
                        scale = Math.max(1, Math.min(scale, 3)); 
                        initialDistance = currentDistance;
                        updateTransform();
                    }
                }
            });
            
            function getDistance(touch1, touch2) {
                const dx = touch1.clientX - touch2.clientX;
                const dy = touch1.clientY - touch2.clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }
            
            function updateTransform() {
                parkingImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
            }
        }
    }

    
    const statusUrl = '/parking-allotment/api/parking-status/';
    const pollingMS = 2000;

    async function fetchStatus() {
        try {
            const response = await fetch(statusUrl, {cache: 'no-store'});

            if (!response.ok) throw new Error('HTTP' + response.status);

            const data = await response.json();

            document.getElementById('occupied-count').innerText = data.occupied;
            document.getElementById('vacant-count').innerText = data.vacant;
        } catch (error) {
            console.erroror('Failed to fetch parking status', error);
        }
    }

    setInterval(fetchStatus, pollingMS);
    fetchStatus();

    const snapshotImage = document.getElementById('parking-snapshot');
    const snapshotPollingMS = 60 * 1000; // 60 seconds

    async function fetchSnapshot() {
        try {
            const response = await fetch('/parking-allotment/api/latest-snapshot/', {cache: 'no-store'});

            if (!response.ok) throw new Error(response.status);

            const data = await response.json();

            if (data.url) {
                snapshotImage.src = data.url + '?t=' + new Date().getTime(); // Cache-busting
            }
        } catch (error) {
            console.error('Failed to fetch snapshot.', error);
        }
    }

    fetchSnapshot();
    setInterval(fetchSnapshot, snapshotPollingMS);

    const vacantUrl = '/parking-allotment/api/vacant-slots/';
    const vacantPollingMS = 2000;

    async function fetchVacantCount() {
        try {
            const response = await fetch(vacantUrl, {cache: 'no-store'});
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            document.getElementById('available-parking').innerText = data.vacant;
        } catch (error) {
            console.error('Failed to fetch vacant slots count', error);
        }
    }

    setInterval(fetchVacantCount, vacantPollingMS);
    fetchVacantCount();
}