function initializeParkingSlotManagement() {
    const parkingImage = document.getElementById('parking-image');
    const canvas = document.getElementById('bounding-canvas');
    if (!parkingImage || !canvas) return; // Safety check

    const ctx = canvas.getContext('2d');
    const modeIndicator = document.getElementById('mode-indicator');
    const selectedInfo = document.getElementById('selected-info');
    const selectedSlot = document.getElementById('selected-slot');
    const initialControls = document.getElementById('initial-controls');
    const editingControls = document.getElementById('editing-controls');
    const instructions = document.getElementById('instructions');
    const unsavedWarning = document.getElementById('unsaved-warning');
    
    const startEditBtn = document.getElementById('start-edit');
    const addButton = document.getElementById('add-slot');
    const editButton = document.getElementById('edit-slot');
    const deleteButton = document.getElementById('delete-slot');
    const saveButton = document.getElementById('save-changes');
    const cancelButton = document.getElementById('cancel-edit');
    
    let currentMode = 'view';
    let boundingBoxes = [];
    let originalBoxes = [];
    let currentBox = null;
    let isDrawing = false;
    let isResizing = false;
    let isMoving = false;
    let startX, startY;
    let selectedBoxIndex = -1;
    let resizeHandleIndex = -1;
    let imageWidth = 0;
    let imageHeight = 0;
    let hasUnsavedChanges = false;
    let scaleX = 1;
    let scaleY = 1;

    function setCanvasSize() {
        const imgRect = parkingImage.getBoundingClientRect();
        canvas.width = imgRect.width;
        canvas.height = imgRect.height;
        imageWidth = parkingImage.naturalWidth;
        imageHeight = parkingImage.naturalHeight;
        scaleX = imageWidth / imgRect.width;
        scaleY = imageHeight / imgRect.height;
        drawBoundingBoxes();
    }

    function screenToImageCoords(screenX, screenY) {
        const imgRect = parkingImage.getBoundingClientRect();
        return {
            x: Math.round((screenX - imgRect.left) * scaleX),
            y: Math.round((screenY - imgRect.top) * scaleY)
        };
    }

    function imageToScreenCoords(imageX, imageY) {
        const imgRect = parkingImage.getBoundingClientRect();
        return {
            x: Math.round(imageX / scaleX),
            y: Math.round(imageY / scaleY)
        };
    }

    function drawBoundingBoxes() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        boundingBoxes.forEach((box, index) => {
            const screenCoords = imageToScreenCoords(box.x, box.y);
            const screenWidth = box.width / scaleX;
            const screenHeight = box.height / scaleY;
            ctx.strokeStyle = index === selectedBoxIndex ? '#ff0000' : '#00aa00';
            ctx.lineWidth = index === selectedBoxIndex ? 3 : 2;
            ctx.strokeRect(screenCoords.x, screenCoords.y, screenWidth, screenHeight);
            ctx.fillStyle = index === selectedBoxIndex ? '#ff0000' : '#00aa00';
            ctx.font = '14px Arial';
            ctx.fillText(box.id, screenCoords.x + 5, screenCoords.y - 5);
        });
    }

    function updateSelectedInfo() {
        if (selectedBoxIndex !== -1) {
            selectedInfo.classList.remove('hidden');
            selectedSlot.textContent = boundingBoxes[selectedBoxIndex].id;
        } else {
            selectedInfo.classList.add('hidden');
        }
    }

    function markUnsavedChanges() {
        hasUnsavedChanges = true;
        unsavedWarning.classList.remove('hidden');
    }

    function clearUnsavedChanges() {
        hasUnsavedChanges = false;
        unsavedWarning.classList.add('hidden');
    }

    function startEditing() {
        originalBoxes = JSON.parse(JSON.stringify(boundingBoxes));
        initialControls.classList.add('hidden');
        editingControls.classList.remove('hidden');
        instructions.classList.remove('hidden');
        modeIndicator.classList.remove('hidden');
        canvas.style.cursor = 'default';
        currentMode = 'edit';
        modeIndicator.textContent = 'Mode: Edit Parking Slot';
    }

    function saveChanges() {
        console.log('Saving parking slots:', boundingBoxes);
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/parking-slots/save', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-CSRF-TOKEN', document.querySelector('meta[name="csrf-token"]').getAttribute('content'));
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                if (xhr.status === 200) {
                    clearUnsavedChanges();
                    exitEditing();
                    Swal.fire('Success!', 'Parking slots saved successfully.', 'success');
                } else {
                    Swal.fire('Error!', 'Failed to save parking slots.', 'error');
                }
            }
        };
        const dataToSend = { parking_slots: boundingBoxes, image_width: imageWidth, image_height: imageHeight };
        xhr.send(JSON.stringify(dataToSend));
    }

    function exitEditing() {
        initialControls.classList.remove('hidden');
        editingControls.classList.add('hidden');
        instructions.classList.add('hidden');
        modeIndicator.classList.add('hidden');
        selectedInfo.classList.add('hidden');
        unsavedWarning.classList.add('hidden');
        canvas.style.cursor = 'default';
        currentMode = 'view';
        selectedBoxIndex = -1;
        drawBoundingBoxes();
    }

    function loadParkingSlots() {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/parking-slots', true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                if (response.parking_slots && Array.isArray(response.parking_slots)) {
                    boundingBoxes = response.parking_slots;
                    drawBoundingBoxes();
                }
            }
        };
        xhr.send();
    }

    startEditBtn.addEventListener('click', startEditing);
    saveButton.addEventListener('click', saveChanges);
    cancelButton.addEventListener('click', exitEditing);

    if (parkingImage.complete && parkingImage.naturalWidth > 0) {
        setCanvasSize();
    } else {
        parkingImage.addEventListener('load', () => setTimeout(setCanvasSize, 100));
    }

    window.addEventListener('resize', () => setTimeout(setCanvasSize, 100));
    loadParkingSlots();
}

// ✅ Initialize only when the section exists (AJAX-safe)
function setupParkingSlotObserver() {
    // Watch for any DOM changes (like new page content)
    const observer = new MutationObserver(() => {
        const section = document.querySelector('.parking-slot-management');
        const parkingImage = document.getElementById('parking-image');

        // Only initialize once per navigation
        if (section && !section.dataset.initialized) {
            section.dataset.initialized = "true";

            if (parkingImage) {
                if (parkingImage.complete && parkingImage.naturalWidth > 0) {
                    initializeParkingSlotManagement();
                } else {
                    parkingImage.addEventListener('load', initializeParkingSlotManagement, { once: true });
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Initial page load
document.addEventListener('DOMContentLoaded', () => {
    setupParkingSlotObserver();

    const section = document.querySelector('.parking-slot-management');
    const parkingImage = document.getElementById('parking-image');

    if (section && parkingImage) {
        if (parkingImage.complete && parkingImage.naturalWidth > 0) {
            initializeParkingSlotManagement();
        } else {
            parkingImage.addEventListener('load', initializeParkingSlotManagement, { once: true });
        }
    }
});


