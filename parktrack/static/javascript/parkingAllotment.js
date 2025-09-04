export function initializeParkingAllotment() {
    const carToggle = document.getElementById('car-toggle');
    const motorToggle = document.getElementById('motor-toggle');
    const liveToggle = document.getElementById('live-toggle');
    
    const carSection = document.getElementById('car-section');
    const motorSection = document.getElementById('motor-section');
    const liveSection = document.getElementById('live-section');
    
    const carStatus = document.getElementById('car-status');
    const motorStatus = document.getElementById('motor-status');
    const statusContainer = document.getElementById('status-container');
    const toggleContainer = document.getElementById('toggle-container');
    
    
    function resetToggles() {
        carToggle.classList.remove('bg-red-600', 'text-white');
        carToggle.classList.add('bg-gray-200', 'text-black');
        motorToggle.classList.remove('bg-red-600', 'text-white');
        motorToggle.classList.add('bg-gray-200', 'text-black');
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
            motorStatus.classList.add('hidden');
            carToggle.classList.remove('bg-gray-200', 'text-black');
            carToggle.classList.add('bg-red-600', 'text-white');

        } else if (section === 'motor') {
            
            motorSection.classList.remove('hidden');
            statusContainer.classList.remove('hidden');
            toggleContainer.classList.remove('hidden');
            motorStatus.classList.remove('hidden');
            carStatus.classList.add('hidden');
            motorToggle.classList.remove('bg-gray-200', 'text-black');
            motorToggle.classList.add('bg-red-600', 'text-white');

        } else if (section === 'live') {
            
            liveSection.classList.remove('hidden');
            statusContainer.classList.add('hidden');
            toggleContainer.classList.add('hidden');
            liveToggle?.classList.remove('bg-gray-200', 'text-black');
            liveToggle?.classList.add('bg-red-600', 'text-white');

        }
    }

    document.getElementById('content').addEventListener('click', function(event) {
        if (event.target.closest('#car-toggle')) {
            showSection('car');
        } 
        if (event.target.closest('#motor-toggle')) {
            showSection('motor');
        } 
        if (event.target.closest('#live-toggle')) {
            showSection('live');
        } 
         if (event.target.closest('#back-to-car')) {
            showSection('car');
        }
    });

    showSection('car');
}