export function initializeSettings() {    
    // Email
    const editEmailBtn = document.getElementById('edit-email-btn');
    const emailModal = document.getElementById('email-edit-modal');
    const cancelEmailBtn = document.getElementById('cancel-email-edit-btn');
    
    // Contact number
    const editPhoneBtn = document.getElementById('edit-phone-btn');
    const phoneModal = document.getElementById('phone-edit-modal');
    const cancelPhoneBtn = document.getElementById('cancel-edit-btn');
    
    document.getElementById('content').addEventListener('click', function(event) {
        if (event.target.closest('#edit-email-btn')) {
            document.getElementById('email-edit-modal').classList.remove('hidden');
        }
        if (event.target.closest('#cancel-email-edit-btn')) {
            document.getElementById('email-edit-modal').classList.add('hidden');
        }
        if (event.target.closest('#edit-phone-btn')) {
            document.getElementById('phone-edit-modal').classList.remove('hidden');
        }
        if (event.target.closest('#cancel-edit-btn')) {
            document.getElementById('phone-edit-modal').classList.add('hidden');
        }
    });

    // ===================== VEHICLE =====================
    const editVehicleBtns = document.querySelectorAll('.edit-vehicle-btn'); 
    const vehicleModal = document.getElementById('vehicle-edit-modal');
    const cancelVehicleBtn = document.getElementById('cancel-vehicle-edit-btn');
    const saveVehicleBtn = document.getElementById('save-vehicle-btn');

    const vehicleForm = {
        plate: document.getElementById('edit-plate'),
        brand: document.getElementById('edit-brand'),
        model: document.getElementById('edit-model'),
        type: document.getElementById('edit-type'),
        color: document.getElementById('edit-color'),
        gate: document.getElementById('edit-gate'),
    };

    let activeVehicleRow = null;

    editVehicleBtns.forEach((btn) => {
        btn.addEventListener('click', function() {
            activeVehicleRow = this.closest('div').previousElementSibling.querySelector('tbody');
            vehicleForm.plate.value = activeVehicleRow.querySelector('.plate').innerText.trim();
            vehicleForm.brand.value = activeVehicleRow.querySelector('.brand').innerText.trim();
            vehicleForm.model.value = activeVehicleRow.querySelector('.model').innerText.trim();
            vehicleForm.type.value = activeVehicleRow.querySelector('.type').innerText.trim();
            vehicleForm.color.value = activeVehicleRow.querySelector('.color').innerText.trim();
            vehicleForm.gate.value = activeVehicleRow.querySelector('.gate').innerText.trim();
            vehicleModal.classList.remove('hidden');
        });
    });

    if (cancelVehicleBtn) {
        cancelVehicleBtn.addEventListener('click', function() {
            vehicleModal.classList.add('hidden');
        });
    }

    if (saveVehicleBtn) {
        saveVehicleBtn.addEventListener('click', function() {
            if (activeVehicleRow) {
            activeVehicleRow.querySelector('.plate').innerText = vehicleForm.plate.value;
            activeVehicleRow.querySelector('.brand').innerText = vehicleForm.brand.value;
            activeVehicleRow.querySelector('.model').innerText = vehicleForm.model.value;
            activeVehicleRow.querySelector('.type').innerText = vehicleForm.type.value;
            activeVehicleRow.querySelector('.color').innerText = vehicleForm.color.value;
            activeVehicleRow.querySelector('.gate').innerText = vehicleForm.gate.value;
            vehicleModal.classList.add('hidden');
            }
        });
    }
}