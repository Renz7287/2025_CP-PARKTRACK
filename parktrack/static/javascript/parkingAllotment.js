// parkingallotment.js
let hls;

export function initializeParkingAllotment() {
    const carToggle = document.getElementById('car-toggle');
    const liveToggle = document.getElementById('live-toggle');
    const reservationsToggle = document.getElementById('reservations-toggle');
    
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

    /* ================= RESERVATION MODAL LOGIC ================= */
    initializeReservationSystem();
    
    /* ================= ADMIN RESERVATION MODAL ================= */
    if (document.getElementById('reservations-toggle')) {
        initializeAdminReservationsModal();
    }

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
    
    // Live video counter
    const statusUrl = '/parking-allotment/api/parking-status/';

    async function fetchStatus() {
        try {
            const response = await fetch(statusUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            document.getElementById('occupied-count').innerText = data.occupied;
            document.getElementById('vacant-count').innerText = data.vacant;
        } catch (error) {
            console.error('Failed to fetch parking status', error);
        }
    }
    fetchStatus();
    setInterval(fetchStatus, 2000);

    // Snapshot and counter
    const snapshotImage = document.getElementById('parking-snapshot');
    const dashboardTimer = document.getElementById('dashboard-snapshot-timer');
    const SNAPSHOT_INTERVAL_MS = 60 * 1000;
    let dashNextUpdateAt = null;

    function updateDashTimerDisplay() {
        if (!dashNextUpdateAt) return;
        const secondsLeft = Math.max(0, Math.round((dashNextUpdateAt - Date.now()) / 1000));
        const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
        const s = String(secondsLeft % 60).padStart(2, '0');
        dashboardTimer.textContent = secondsLeft === 0 ? 'Updating...' : `${m}:${s}`;
    }

    async function fetchSnapshot() {
        try {
            const response = await fetch('/parking-allotment/api/latest-snapshot/', { cache: 'no-store' });
            if (!response.ok) throw new Error(response.status);
            const data = await response.json();
            if (data.url) {
                snapshotImage.src = data.url + '?t=' + new Date().getTime();
            }
            // Snapshot counter updates ONLY here, in sync with the image
            const availableEl = document.getElementById('available-parking');
            if (availableEl) availableEl.innerText = data.vacant ?? '--';
            // Sync timer to actual file write time
            if (data.last_modified) {
                dashNextUpdateAt = data.last_modified + SNAPSHOT_INTERVAL_MS;
            }
        } catch (error) {
            console.error('Failed to fetch snapshot.', error);
        }
    }
    fetchSnapshot();
    setInterval(fetchSnapshot, 15 * 1000);
    setInterval(updateDashTimerDisplay, 1000);
}

/* ================= RESERVATION SYSTEM FUNCTION ================= */
function initializeReservationSystem() {
    console.log('Initializing reservation system...');
    
    // Get all DOM elements with error checking
    const modal = document.getElementById('reservation-modal');
    const confirmModal = document.getElementById('confirmation-modal');
    const reserveBtn = document.getElementById('reserve-toggle');
    const closeBtn = document.getElementById('close-reservation');
    const confirmBtn = document.getElementById('confirm-reservation');
    const cancelConfirmBtn = document.getElementById('cancel-confirmation');
    const proceedBtn = document.getElementById('proceed-reservation');
    const showAddBtn = document.getElementById('show-add-reservation');
    const reservationsList = document.getElementById('reservations-list');
    const noReservationsMsg = document.getElementById('no-reservations-msg');
    const addSection = document.getElementById('add-reservation-section');
    const form = document.getElementById('reservation-form');
    
    // Check if essential elements exist
    if (!modal || !reserveBtn) {
        console.error('Reservation modal or button not found');
        return;
    }
    
    // Temporary storage for pending reservation
    let pendingReservation = null;
    
    // Sample reservations data with expiration
    let reservations = [];
    
    // Function to combine today's date with selected time
    function getDateTimeFromTime(timeString) {
        if (!timeString) return null;
        
        const today = new Date();
        const [hours, minutes] = timeString.split(':');
        
        const dateTime = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            parseInt(hours),
            parseInt(minutes),
            0
        );
        
        return dateTime;
    }
    
    // Function to check if a reservation is expired
    function isReservationExpired(reservation) {
        if (!reservation || !reservation.expiryTime) return false;
        
        const now = new Date().getTime();
        return now > reservation.expiryTime;
    }
    
    // Function to clean expired reservations
    function cleanExpiredReservations() {
        const beforeCount = reservations.length;
        reservations = reservations.filter(res => !isReservationExpired(res));
        
        if (reservations.length < beforeCount) {
            updateReservationsDisplay();
        }
        
        return reservations;
    }
    
    // Function to format remaining time
    function getRemainingTime(expiryTime) {
        if (!expiryTime) return 'No expiry';
        
        const now = new Date().getTime();
        const remaining = expiryTime - now;
        
        if (remaining <= 0) return 'Expired';
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    // Function to update countdown timers
    function updateCountdowns() {
        const timerElements = document.querySelectorAll('.reservation-timer');
        let hasUpdates = false;
        
        timerElements.forEach(element => {
            const expiryTime = element.getAttribute('data-expiry');
            if (!expiryTime) return;
            
            const remaining = getRemainingTime(parseInt(expiryTime));
            
            if (remaining === 'Expired') {
                hasUpdates = true;
            }
            
            element.textContent = remaining;
            
            // Change color when less than 1 minute remaining
            if (expiryTime && (parseInt(expiryTime) - new Date().getTime() < 60000)) {
                element.classList.add('text-red-500', 'font-bold');
            } else {
                element.classList.remove('text-red-500', 'font-bold');
            }
        });
        
        if (hasUpdates) {
            cleanExpiredReservations();
        }
    }
    
    // Function to update reservations display
    function updateReservationsDisplay() {
        // Check if elements exist
        if (!reservationsList || !noReservationsMsg || !addSection) {
            console.error('Required display elements not found');
            return;
        }
        
        // Clean expired reservations first
        cleanExpiredReservations();
        
        if (reservations.length === 0) {
            noReservationsMsg.style.display = 'block';
            reservationsList.innerHTML = '<p class="text-gray-500 text-sm text-center py-2" id="no-reservations-msg">You have no active reservations</p>';
            // Show add reservation section when no reservations
            if (addSection) {
                addSection.style.display = 'block';
            }
        } else {
            noReservationsMsg.style.display = 'none';
            let html = '';
            reservations.forEach((res, index) => {
                const expiryTime = res.expiryTime;
                const isExpired = isReservationExpired(res);
                
                if (isExpired) return; // Skip expired reservations
                
                const timeRemaining = getRemainingTime(expiryTime);
                const timeClass = expiryTime - new Date().getTime() < 60000 ? 'text-red-500 font-bold' : 'text-gray-600';
                
                // Format time for display
                const arrivalDate = new Date(res.arrivalTime);
                const formattedTime = arrivalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                html += `
                    <div class="border rounded-lg p-3 bg-white">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <p class="font-semibold text-lg">${res.slot}</p>
                                <p class="text-sm text-gray-600">${res.plate}</p>
                                <p class="text-xs text-gray-500">Arrival: ${formattedTime}</p>
                            </div>
                            <button class="text-red-500 hover:text-red-700 cancel-reservation" data-index="${index}">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </div>
                        <div class="flex justify-between items-center text-xs">
                            <span class="reservation-timer ${timeClass}" data-expiry="${expiryTime}">
                                ${timeRemaining}
                            </span>
                            <span class="text-gray-400">Expires 5min after arrival</span>
                        </div>
                    </div>
                `;
            });
            
            if (html === '') {
                // All reservations were expired
                reservations = [];
                updateReservationsDisplay();
                return;
            }
            
            reservationsList.innerHTML = html;
            
            // Hide add reservation section when user has reservations
            if (addSection) {
                addSection.style.display = 'none';
            }
            
            // Add cancel functionality
            document.querySelectorAll('.cancel-reservation').forEach(btn => {
                btn.addEventListener('click', function() {
                    const index = this.getAttribute('data-index');
                    
                    // Show confirmation before cancel
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            title: 'Cancel Reservation?',
                            text: 'Are you sure you want to cancel this reservation?',
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#d33',
                            cancelButtonColor: '#6b7280',
                            confirmButtonText: 'Yes, cancel it'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                reservations.splice(index, 1);
                                updateReservationsDisplay();
                                Swal.fire({
                                    title: 'Cancelled!',
                                    text: 'Your reservation has been cancelled.',
                                    icon: 'success',
                                    timer: 2000,
                                    showConfirmButton: false
                                });
                            }
                        });
                    } else {
                        // Fallback if SweetAlert is not loaded
                        if (confirm('Are you sure you want to cancel this reservation?')) {
                            reservations.splice(index, 1);
                            updateReservationsDisplay();
                            alert('Reservation cancelled!');
                        }
                    }
                });
            });
        }
    }
    
    // Start countdown timer (update every second)
    let countdownInterval = setInterval(updateCountdowns, 1000);
    
    // Open modal
    if (reserveBtn) {
        reserveBtn.addEventListener('click', function() {
            console.log('Reserve button clicked');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                
                // Set current time as min for time input
                const timeInput = document.getElementById('arrival-time');
                if (timeInput) {
                    const now = new Date();
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const currentTime = `${hours}:${minutes}`;
                    timeInput.min = currentTime;
                }
                
                updateReservationsDisplay();
            }
        });
    }
    
    // Close reservation modal
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                // Reset form
                const plateInput = document.getElementById('plate-number');
                const timeInput = document.getElementById('arrival-time');
                const slotSelect = document.getElementById('parking-slot');
                
                if (plateInput) plateInput.value = '';
                if (timeInput) timeInput.value = '';
                if (slotSelect) slotSelect.value = '';
            }
        });
    }
    
    // Close reservation modal when clicking outside
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
        });
    }
    
    // Close confirmation modal
    if (cancelConfirmBtn && confirmModal) {
        cancelConfirmBtn.addEventListener('click', function() {
            confirmModal.classList.add('hidden');
            confirmModal.classList.remove('flex');
            pendingReservation = null;
        });
    }
    
    // Close confirmation modal when clicking outside
    if (confirmModal) {
        confirmModal.addEventListener('click', function(e) {
            if (e.target === confirmModal) {
                confirmModal.classList.add('hidden');
                confirmModal.classList.remove('flex');
                pendingReservation = null;
            }
        });
    }
    
    // Show add reservation form (when hidden)
    if (showAddBtn && form) {
        showAddBtn.addEventListener('click', function() {
            form.style.display = 'block';
            showAddBtn.style.display = 'none';
        });
    }
    
    // Confirm button - show confirmation modal
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            const plateInput = document.getElementById('plate-number');
            const timeInput = document.getElementById('arrival-time');
            const slotSelect = document.getElementById('parking-slot');
            
            if (!plateInput || !timeInput || !slotSelect) {
                console.error('Form elements not found');
                return;
            }
            
            const plate = plateInput.value.trim();
            const arrivalTimeStr = timeInput.value;
            const slot = slotSelect.value;
            
            if (!plate || !arrivalTimeStr || !slot) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Error!',
                        text: 'Please fill in all fields',
                        icon: 'error',
                        confirmButtonColor: '#3085d6',
                        confirmButtonText: 'OK'
                    });
                } else {
                    alert('Please fill in all fields');
                }
                return;
            }
            
            // Get datetime from time string
            const arrivalDateTime = getDateTimeFromTime(arrivalTimeStr);
            if (!arrivalDateTime) {
                alert('Invalid time format');
                return;
            }
            
            const now = new Date().getTime();
            
            // Check if time is in the past
            if (arrivalDateTime.getTime() < now) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Invalid Time',
                        text: 'Arrival time cannot be in the past',
                        icon: 'error',
                        confirmButtonColor: '#3085d6',
                        confirmButtonText: 'OK'
                    });
                } else {
                    alert('Arrival time cannot be in the past');
                }
                return;
            }
            
            // Store pending reservation
            pendingReservation = {
                plate: plate,
                arrivalTimeStr: arrivalTimeStr,
                arrivalDateTime: arrivalDateTime.getTime(),
                slot: slot
            };
            
            // Update confirmation modal details
            const confirmSlot = document.getElementById('confirm-slot');
            const confirmPlate = document.getElementById('confirm-plate');
            const confirmTime = document.getElementById('confirm-time');
            
            if (confirmSlot && confirmPlate && confirmTime && confirmModal) {
                confirmSlot.textContent = slot;
                confirmPlate.textContent = plate;
                confirmTime.textContent = arrivalTimeStr;
                
                // Show confirmation modal
                confirmModal.classList.remove('hidden');
                confirmModal.classList.add('flex');
            }
        });
    }
    
    // Proceed with reservation
    if (proceedBtn) {
        proceedBtn.addEventListener('click', function() {
            if (!pendingReservation) return;
            
            // Calculate expiry time (5 minutes after arrival)
            const expiryTime = pendingReservation.arrivalDateTime + (5 * 60000);
            
            // Add new reservation with expiration
            reservations.push({
                plate: pendingReservation.plate,
                arrivalTime: pendingReservation.arrivalDateTime,
                expiryTime: expiryTime,
                slot: pendingReservation.slot,
                createdAt: new Date().getTime()
            });
            
            // Reset form
            const plateInput = document.getElementById('plate-number');
            const timeInput = document.getElementById('arrival-time');
            const slotSelect = document.getElementById('parking-slot');
            
            if (plateInput) plateInput.value = '';
            if (timeInput) timeInput.value = '';
            if (slotSelect) slotSelect.value = '';
            
            // Update display
            updateReservationsDisplay();
            
            // Hide form if show button exists
            if (showAddBtn && form) {
                form.style.display = 'none';
                showAddBtn.style.display = 'block';
            }
            
            // Close both modals
            if (confirmModal) {
                confirmModal.classList.add('hidden');
                confirmModal.classList.remove('flex');
            }
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            
            // Show success Sweet Alert
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Reservation Confirmed!',
                    html: `
                        <div class="text-left">
                            <p><strong>Slot:</strong> ${pendingReservation.slot}</p>
                            <p><strong>Plate:</strong> ${pendingReservation.plate}</p>
                            <p><strong>Arrival Time:</strong> ${pendingReservation.arrivalTimeStr}</p>
                            <p class="text-sm text-gray-500 mt-2">⏰ You have 5 minutes to arrive after your selected time</p>
                        </div>
                    `,
                    icon: 'success',
                    confirmButtonColor: '#10b981',
                    confirmButtonText: 'OK',
                    timer: 5000,
                    timerProgressBar: true
                });
            } else {
                alert(`Reservation confirmed for slot ${pendingReservation.slot}!`);
            }
            
            pendingReservation = null;
        });
    }
    
    // Initialize form visibility
    if (form && showAddBtn) {
        form.style.display = 'none';
        showAddBtn.style.display = 'block';
    }
    
    // Initial display
    updateReservationsDisplay();
    
    // Clean up interval when page unloads
    window.addEventListener('beforeunload', function() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
    });
    
    console.log('Reservation system initialized successfully');
}

/* ================= ADMIN RESERVATIONS MODAL ================= */
function initializeAdminReservationsModal() {
    console.log('Initializing admin reservations modal...');
    
    const adminModal = document.getElementById('admin-reservations-modal');
    const reservationsToggle = document.getElementById('reservations-toggle');
    const closeAdminModal = document.getElementById('close-admin-reservations');
    const adminReservationsList = document.getElementById('admin-reservations-list');
    const adminNoReservations = document.getElementById('admin-no-reservations');
    const adminRefreshBtn = document.getElementById('admin-refresh-reservations');
    const adminSearchInput = document.getElementById('admin-search-reservations');
    const adminFilterStatus = document.getElementById('admin-filter-status');
    
    // Check if modal exists
    if (!adminModal || !reservationsToggle) {
        console.error('Admin modal or toggle button not found');
        return;
    }
    
    // Sample admin reservations data (in production, this would come from an API)
    let adminReservations = [
        {
            id: 1,
            plate: 'ABC-1234',
            slot: 'A1',
            arrivalTime: new Date().getTime() + 3600000, // 1 hour from now
            expiryTime: new Date().getTime() + 3600000 + 300000, // 1 hour 5 min from now
            status: 'active',
            userId: 'user1',
            userName: 'John Doe'
        },
        {
            id: 2,
            plate: 'XYZ-5678',
            slot: 'B3',
            arrivalTime: new Date().getTime() - 1800000, // 30 min ago
            expiryTime: new Date().getTime() - 1500000, // expired
            status: 'expired',
            userId: 'user2',
            userName: 'Jane Smith'
        },
        {
            id: 3,
            plate: 'DEF-9012',
            slot: 'C2',
            arrivalTime: new Date().getTime() + 7200000, // 2 hours from now
            expiryTime: new Date().getTime() + 7200000 + 300000, // 2 hours 5 min from now
            status: 'active',
            userId: 'user3',
            userName: 'Bob Johnson'
        },
        {
            id: 4,
            plate: 'GHI-3456',
            slot: 'D4',
            arrivalTime: new Date().getTime() + 5400000, // 1.5 hours from now
            expiryTime: new Date().getTime() + 5400000 + 300000,
            status: 'active',
            userId: 'user4',
            userName: 'Alice Williams'
        },
        {
            id: 5,
            plate: 'JKL-7890',
            slot: 'E5',
            arrivalTime: new Date().getTime() - 7200000, // 2 hours ago
            expiryTime: new Date().getTime() - 6900000, // expired
            status: 'expired',
            userId: 'user5',
            userName: 'Charlie Brown'
        }
    ];
    
    // Open modal
    reservationsToggle.addEventListener('click', function() {
        adminModal.classList.remove('hidden');
        adminModal.classList.add('flex');
        loadAdminReservations();
    });
    
    // Close modal
    if (closeAdminModal) {
        closeAdminModal.addEventListener('click', function() {
            adminModal.classList.add('hidden');
            adminModal.classList.remove('flex');
        });
    }
    
    // Close modal when clicking outside
    adminModal.addEventListener('click', function(e) {
        if (e.target === adminModal) {
            adminModal.classList.add('hidden');
            adminModal.classList.remove('flex');
        }
    });
    
    // Load and display admin reservations
    function loadAdminReservations() {
        if (!adminReservationsList || !adminNoReservations) return;
        
        // Get filter and search values
        const searchTerm = adminSearchInput ? adminSearchInput.value.toLowerCase() : '';
        const statusFilter = adminFilterStatus ? adminFilterStatus.value : 'all';
        
        // Filter reservations
        let filteredReservations = adminReservations.filter(res => {
            // Status filter
            if (statusFilter !== 'all' && res.status !== statusFilter) {
                return false;
            }
            
            // Search filter
            if (searchTerm) {
                return res.plate.toLowerCase().includes(searchTerm) ||
                       res.slot.toLowerCase().includes(searchTerm) ||
                       (res.userName && res.userName.toLowerCase().includes(searchTerm));
            }
            
            return true;
        });
        
        // Sort by arrival time (most recent first for active, oldest first for expired)
        filteredReservations.sort((a, b) => {
            if (statusFilter === 'expired') {
                return b.arrivalTime - a.arrivalTime;
            }
            return a.arrivalTime - b.arrivalTime;
        });
        
        // Update summary counts
        updateSummaryCounts();
        
        if (filteredReservations.length === 0) {
            adminNoReservations.style.display = 'block';
            adminReservationsList.innerHTML = '';
        } else {
            adminNoReservations.style.display = 'none';
            let html = '';
            
            filteredReservations.forEach(res => {
                const arrivalDate = new Date(res.arrivalTime);
                const expiryDate = new Date(res.expiryTime);
                
                const formattedArrival = arrivalDate.toLocaleString();
                const formattedExpiry = expiryDate.toLocaleString();
                
                const statusClass = res.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
                const statusText = res.status === 'active' ? 'Active' : 'Expired';
                
                html += `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="py-3 px-4">${res.userName || 'Unknown'}</td>
                        <td class="py-3 px-4 font-mono">${res.plate}</td>
                        <td class="py-3 px-4 font-semibold">${res.slot}</td>
                        <td class="py-3 px-4 text-sm">${formattedArrival}</td>
                        <td class="py-3 px-4 text-sm">${formattedExpiry}</td>
                        <td class="py-3 px-4">
                            <span class="px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">
                                ${statusText}
                            </span>
                        </td>
                        <td class="py-3 px-4">
                            <button class="admin-cancel-reservation text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                                    data-id="${res.id}"
                                    ${res.status !== 'active' ? 'disabled' : ''}>
                                <i class="fa-solid fa-ban"></i> Cancel
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            adminReservationsList.innerHTML = html;
            
            // Add cancel functionality for admin
            document.querySelectorAll('.admin-cancel-reservation').forEach(btn => {
                btn.addEventListener('click', function() {
                    const id = parseInt(this.getAttribute('data-id'));
                    
                    if (typeof Swal !== 'undefined') {
                        Swal.fire({
                            title: 'Cancel Reservation?',
                            text: 'Are you sure you want to cancel this reservation? This action cannot be undone.',
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonColor: '#d33',
                            cancelButtonColor: '#6b7280',
                            confirmButtonText: 'Yes, cancel it'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                cancelAdminReservation(id);
                            }
                        });
                    } else {
                        if (confirm('Are you sure you want to cancel this reservation?')) {
                            cancelAdminReservation(id);
                        }
                    }
                });
            });
        }
    }
    
    // Update summary counts
    function updateSummaryCounts() {
        const totalEl = document.getElementById('admin-total-count');
        const activeEl = document.getElementById('admin-active-count');
        const expiredEl = document.getElementById('admin-expired-count');
        
        if (totalEl) {
            totalEl.textContent = adminReservations.length;
        }
        
        if (activeEl) {
            const activeCount = adminReservations.filter(r => r.status === 'active').length;
            activeEl.textContent = activeCount;
        }
        
        if (expiredEl) {
            const expiredCount = adminReservations.filter(r => r.status === 'expired').length;
            expiredEl.textContent = expiredCount;
        }
    }
    
    // Cancel reservation as admin
    function cancelAdminReservation(reservationId) {
        // Find the reservation
        const index = adminReservations.findIndex(r => r.id === reservationId);
        
        if (index !== -1) {
            // Remove the reservation
            adminReservations.splice(index, 1);
            
            // Reload the list
            loadAdminReservations();
            
            // Show success message
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Cancelled!',
                    text: 'The reservation has been cancelled successfully.',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                alert('Reservation cancelled successfully!');
            }
        }
    }
    
    // Add event listeners
    if (adminRefreshBtn) {
        adminRefreshBtn.addEventListener('click', loadAdminReservations);
    }
    
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', debounce(loadAdminReservations, 300));
    }
    
    if (adminFilterStatus) {
        adminFilterStatus.addEventListener('change', loadAdminReservations);
    }
    
    // Debounce function for search input
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    console.log('Admin reservations modal initialized');
}

// Helper function for CSRF token (kept from original)
function getCSRFToken() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value;
}