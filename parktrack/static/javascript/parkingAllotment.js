let hls;

export function initializeParkingAllotment() {
    const carToggle = document.getElementById('car-toggle');
    const liveToggle = document.getElementById('live-toggle');
    
    const carSection = document.getElementById('car-section');
    const liveSection = document.getElementById('live-section');
    
    const carStatus = document.getElementById('car-status');
    const statusContainer = document.getElementById('status-container');
    const toggleContainer = document.getElementById('toggle-container');
    
    function resetToggles() {
        carToggle.classList.remove('bg-red-600', 'text-white');
        carToggle.classList.add('bg-gray-200', 'text-black');
        liveToggle?.classList.remove('bg-red-600', 'text-white');
        liveToggle?.classList.add('bg-gray-200', 'text-black');    
    }

    function showSection(section) {
        document.querySelectorAll('.section-content').forEach(sec => {
            sec.classList.add('hidden');
        });
    
        resetToggles();
        
        if (section === 'car') {
            carSection.classList.remove('hidden');
            statusContainer.classList.remove('hidden');
            toggleContainer.classList.remove('hidden');
            carStatus.classList.remove('hidden');
            carToggle.classList.remove('bg-gray-200', 'text-black');
            carToggle.classList.add('bg-red-600', 'text-white');
        } else if (section === 'live') {
            liveSection.classList.remove('hidden');
            statusContainer.classList.add('hidden');
            toggleContainer.classList.add('hidden');
            liveToggle?.classList.remove('bg-gray-200', 'text-black');
            liveToggle?.classList.add('bg-red-600', 'text-white');
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
    const videoSrc = 'http://localhost:8080/stream.m3u8';

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
            video.muted = true,
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
}