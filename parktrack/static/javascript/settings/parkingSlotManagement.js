// parkingslotmanagement.js
document.addEventListener('DOMContentLoaded', function() {
    console.log('Parking Slot Management JS loaded -', new Date().toLocaleTimeString());
    
    // Get all DOM elements with error checking
    const parkingImage = document.getElementById('parking-image');
    const canvas = document.getElementById('bounding-canvas');
    
    // Check if critical elements exist
    if (!parkingImage) {
        console.error('CRITICAL: parking-image element not found!');
        return;
    }
    
    if (!canvas) {
        console.error('CRITICAL: bounding-canvas element not found!');
        return;
    }
    
    console.log('✓ Canvas and image elements found');
    
    const ctx = canvas.getContext('2d');
    const modeIndicator = document.getElementById('mode-indicator');
    const selectedInfo = document.getElementById('selected-info');
    const selectedSlot = document.getElementById('selected-slot');
    const initialControls = document.getElementById('initial-controls');
    const editingControls = document.getElementById('editing-controls');
    const instructions = document.getElementById('instructions');
    const unsavedWarning = document.getElementById('unsaved-warning');
    
    // Get all buttons with error checking
    const startEditBtn = document.getElementById('start-edit');
    const addButton = document.getElementById('add-slot');
    const editButton = document.getElementById('edit-slot');
    const deleteButton = document.getElementById('delete-slot');
    const saveButton = document.getElementById('save-changes');
    const cancelButton = document.getElementById('cancel-edit');
    
    // Log button status
    console.log('Button status:', {
        'start-edit': startEditBtn ? '✓ Found' : '✗ Missing',
        'add-slot': addButton ? '✓ Found' : '✗ Missing',
        'edit-slot': editButton ? '✓ Found' : '✗ Missing',
        'delete-slot': deleteButton ? '✓ Found' : '✗ Missing',
        'save-changes': saveButton ? '✓ Found' : '✗ Missing',
        'cancel-edit': cancelButton ? '✓ Found' : '✗ Missing'
    });
    
    // Verify all buttons exist
    if (!startEditBtn || !addButton || !editButton || !deleteButton || !saveButton || !cancelButton) {
        console.error('Some buttons are missing! Check the HTML IDs.');
        return;
    }
    
    console.log('✓ All buttons found');
    
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
        
        console.log('Canvas size set:', canvas.width, 'x', canvas.height);
        
        drawBoundingBoxes();
    }

    function screenToImageCoords(screenX, screenY) {
        const imgRect = parkingImage.getBoundingClientRect();
        
        const relativeX = screenX - imgRect.left;
        const relativeY = screenY - imgRect.top;
        
        return {
            x: Math.round(relativeX * scaleX),
            y: Math.round(relativeY * scaleY)
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
            
            if (currentMode === 'edit' && index === selectedBoxIndex) {
                drawResizeHandles(screenCoords.x, screenCoords.y, screenWidth, screenHeight);
            }
        });
        
        if (currentBox && isDrawing) {
            ctx.strokeStyle = '#0000ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(currentBox.startScreenX, currentBox.startScreenY, currentBox.width, currentBox.height);
        }
    }

    function drawResizeHandles(x, y, width, height) {
        const handleSize = 8;
        const handles = [
            { x: x - handleSize/2, y: y - handleSize/2, type: 'top-left' },
            { x: x + width - handleSize/2, y: y - handleSize/2, type: 'top-right' },
            { x: x - handleSize/2, y: y + height - handleSize/2, type: 'bottom-left' },
            { x: x + width - handleSize/2, y: y + height - handleSize/2, type: 'bottom-right' }
        ];
        
        ctx.fillStyle = '#ff0000';
        handles.forEach(handle => {
            ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
        });
    }

    function getResizeHandles(x, y, width, height) {
        const handleSize = 8;
        return [
            { x: x - handleSize/2, y: y - handleSize/2, type: 'top-left' },
            { x: x + width - handleSize/2, y: y - handleSize/2, type: 'top-right' },
            { x: x - handleSize/2, y: y + height - handleSize/2, type: 'bottom-left' },
            { x: x + width - handleSize/2, y: y + height - handleSize/2, type: 'bottom-right' }
        ];
    }

    function isPointInHandle(x, y, handle) {
        const handleSize = 8;
        return x >= handle.x && x <= handle.x + handleSize && 
               y >= handle.y && y <= handle.y + handleSize;
    }

    function isPointInBox(screenX, screenY, box) {
        const screenCoords = imageToScreenCoords(box.x, box.y);
        const screenWidth = box.width / scaleX;
        const screenHeight = box.height / scaleY;
        
        return screenX >= screenCoords.x && screenX <= screenCoords.x + screenWidth && 
               screenY >= screenCoords.y && screenY <= screenCoords.y + screenHeight;
    }

    // Add event listeners with error handling
    try {
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);
        
        console.log('✓ Canvas event listeners added');
    } catch (e) {
        console.error('Error adding canvas event listeners:', e);
    }

    function handleMouseDown(e) {
        if (currentMode === 'view') return;
        handlePointerDown(e.clientX, e.clientY);
    }

    function handleTouchStart(e) {
        if (currentMode === 'view') return;
        e.preventDefault();
        const touch = e.touches[0];
        handlePointerDown(touch.clientX, touch.clientY);
    }

    function handlePointerDown(clientX, clientY) {
        const imgRect = parkingImage.getBoundingClientRect();
        const screenX = clientX - imgRect.left;
        const screenY = clientY - imgRect.top;
        const imageCoords = screenToImageCoords(clientX, clientY);

        if (currentMode === 'add') {
            startX = imageCoords.x;
            startY = imageCoords.y;
            
            currentBox = {
                startScreenX: screenX,
                startScreenY: screenY,
                width: 0,
                height: 0
            };
            isDrawing = true;
        } else if (currentMode === 'edit') {
            if (selectedBoxIndex !== -1) {
                const box = boundingBoxes[selectedBoxIndex];
                const screenCoords = imageToScreenCoords(box.x, box.y);
                const screenWidth = box.width / scaleX;
                const screenHeight = box.height / scaleY;
                const handles = getResizeHandles(screenCoords.x, screenCoords.y, screenWidth, screenHeight);
                
                for (let i = 0; i < handles.length; i++) {
                    if (isPointInHandle(screenX, screenY, handles[i])) {
                        resizeHandleIndex = i;
                        isResizing = true;
                        startX = imageCoords.x;
                        startY = imageCoords.y;
                        drawBoundingBoxes();
                        return;
                    }
                }
            }
            
            selectedBoxIndex = -1;
            for (let i = boundingBoxes.length - 1; i >= 0; i--) {
                const box = boundingBoxes[i];
                if (isPointInBox(screenX, screenY, box)) {
                    selectedBoxIndex = i;
                    isMoving = true;
                    startX = imageCoords.x;
                    startY = imageCoords.y;
                    updateSelectedInfo();
                    markUnsavedChanges();
                    break;
                }
            }
            drawBoundingBoxes();
        } else if (currentMode === 'delete') {
            for (let i = boundingBoxes.length - 1; i >= 0; i--) {
                const box = boundingBoxes[i];
                if (isPointInBox(screenX, screenY, box)) {
                    boundingBoxes.splice(i, 1);
                    selectedBoxIndex = -1;
                    updateSelectedInfo();
                    markUnsavedChanges();
                    break;
                }
            }
            drawBoundingBoxes();
        }
    }

    function handleMouseMove(e) {
        if (currentMode === 'view') return;
        handlePointerMove(e.clientX, e.clientY);
    }

    function handleTouchMove(e) {
        if (currentMode === 'view') return;
        e.preventDefault();
        const touch = e.touches[0];
        handlePointerMove(touch.clientX, touch.clientY);
    }

    function handlePointerMove(clientX, clientY) {
        const imgRect = parkingImage.getBoundingClientRect();
        const screenX = clientX - imgRect.left;
        const screenY = clientY - imgRect.top;
        const imageCoords = screenToImageCoords(clientX, clientY);

        if (currentMode === 'add' && currentBox && isDrawing) {
            currentBox.width = screenX - currentBox.startScreenX;
            currentBox.height = screenY - currentBox.startScreenY;
            drawBoundingBoxes();
        } else if (currentMode === 'edit' && selectedBoxIndex !== -1) {
            const box = boundingBoxes[selectedBoxIndex];
            
            if (isResizing) {
                const deltaX = imageCoords.x - startX;
                const deltaY = imageCoords.y - startY;
                
                switch (resizeHandleIndex) {
                    case 0: // top-left
                        box.x += deltaX;
                        box.y += deltaY;
                        box.width -= deltaX;
                        box.height -= deltaY;
                        break;
                    case 1: // top-right
                        box.y += deltaY;
                        box.width += deltaX;
                        box.height -= deltaY;
                        break;
                    case 2: // bottom-left
                        box.x += deltaX;
                        box.width -= deltaX;
                        box.height += deltaY;
                        break;
                    case 3: // bottom-right
                        box.width += deltaX;
                        box.height += deltaY;
                        break;
                }
                
                box.width = Math.max(20, box.width);
                box.height = Math.max(20, box.height);
                
                startX = imageCoords.x;
                startY = imageCoords.y;
                markUnsavedChanges();
                drawBoundingBoxes();
            } else if (isMoving) {
                const deltaX = imageCoords.x - startX;
                const deltaY = imageCoords.y - startY;
                box.x += deltaX;
                box.y += deltaY;
                startX = imageCoords.x;
                startY = imageCoords.y;
                markUnsavedChanges();
                drawBoundingBoxes();
            }
        }
    }

    function handleMouseUp() {
        handlePointerUp();
    }

    function handleTouchEnd() {
        handlePointerUp();
    }

    function handlePointerUp() {
        if (currentMode === 'add' && currentBox && isDrawing) {
            const endX = startX + (currentBox.width * scaleX);
            const endY = startY + (currentBox.height * scaleY);
            
            const finalWidth = Math.abs(endX - startX);
            const finalHeight = Math.abs(endY - startY);
            
            if (finalWidth > 20 && finalHeight > 20) {
                const normalizedBox = {
                    x: currentBox.width < 0 ? endX : startX,
                    y: currentBox.height < 0 ? endY : startY,
                    width: finalWidth,
                    height: finalHeight,
                    id: `P${boundingBoxes.length + 1}`
                };
                boundingBoxes.push(normalizedBox);
                markUnsavedChanges();
            }
            currentBox = null;
            isDrawing = false;
            drawBoundingBoxes();
        }
        
        isResizing = false;
        isMoving = false;
        resizeHandleIndex = -1;
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
        console.log('▶ Start Editing clicked');
        originalBoxes = JSON.parse(JSON.stringify(boundingBoxes));
        
        initialControls.classList.add('hidden');
        editingControls.classList.remove('hidden');
        instructions.classList.remove('hidden');
        modeIndicator.classList.remove('hidden');
        
        canvas.style.cursor = 'default';
        currentMode = 'edit';
        modeIndicator.textContent = 'Mode: Edit Parking Slot';
        
        switchToEditMode();
    }

    function switchToAddMode() {
        console.log('➕ Add Mode clicked');
        currentMode = 'add';
        modeIndicator.textContent = 'Mode: Add Parking Slot';
        canvas.style.cursor = 'crosshair';
        selectedBoxIndex = -1;
        updateSelectedInfo();
        drawBoundingBoxes();
    }

    function switchToEditMode() {
        console.log('✏️ Edit Mode clicked');
        currentMode = 'edit';
        modeIndicator.textContent = 'Mode: Edit Parking Slot';
        canvas.style.cursor = 'pointer';
        drawBoundingBoxes();
    }

    function switchToDeleteMode() {
        console.log('🗑️ Delete Mode clicked');
        currentMode = 'delete';
        modeIndicator.textContent = 'Mode: Delete Parking Slot';
        canvas.style.cursor = 'not-allowed';
        selectedBoxIndex = -1;
        updateSelectedInfo();
        drawBoundingBoxes();
    }

    function saveChanges() {
        console.log('💾 Save Changes clicked', boundingBoxes);
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Success!',
                text: 'Parking slots have been saved successfully.',
                icon: 'success',
                confirmButtonText: 'OK'
            });
        } else {
            alert('Parking slots saved successfully!');
        }
        
        clearUnsavedChanges();
        exitEditing();
    }

    function cancelEditing() {
        console.log('❌ Cancel Editing clicked');
        if (hasUnsavedChanges) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Discard Changes?',
                    text: 'You have unsaved changes. Are you sure you want to discard them?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, Discard',
                    cancelButtonText: 'Continue Editing'
                }).then((result) => {
                    if (result.isConfirmed) {
                        boundingBoxes = JSON.parse(JSON.stringify(originalBoxes));
                        exitEditing();
                    }
                });
            } else {
                if (confirm('You have unsaved changes. Discard them?')) {
                    boundingBoxes = JSON.parse(JSON.stringify(originalBoxes));
                    exitEditing();
                }
            }
        } else {
            exitEditing();
        }
    }

    function exitEditing() {
        console.log('🚪 Exiting edit mode');
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

    // Add click handlers with verification
    function addButtonListener(button, handler, buttonName) {
        if (button) {
            button.addEventListener('click', function(e) {
                console.log(`📌 ${buttonName} button clicked`);
                handler(e);
            });
            console.log(`✓ Listener added to ${buttonName} button`);
        } else {
            console.error(`✗ Cannot add listener to ${buttonName} - button not found`);
        }
    }

    // Add all button listeners
    addButtonListener(startEditBtn, startEditing, 'Start Edit');
    addButtonListener(addButton, switchToAddMode, 'Add Slot');
    addButtonListener(editButton, switchToEditMode, 'Edit Slot');
    addButtonListener(deleteButton, switchToDeleteMode, 'Delete Slot');
    addButtonListener(saveButton, saveChanges, 'Save Changes');
    addButtonListener(cancelButton, cancelEditing, 'Cancel Edit');

    // Force a re-check after a short delay (in case of dynamic loading)
    setTimeout(() => {
        console.log('🔄 Re-checking button listeners...');
        console.log('Current button states:', {
            'start-edit': startEditBtn ? '✓' : '✗',
            'add-slot': addButton ? '✓' : '✗',
            'edit-slot': editButton ? '✓' : '✗',
            'delete-slot': deleteButton ? '✓' : '✗',
            'save-changes': saveButton ? '✓' : '✗',
            'cancel-edit': cancelButton ? '✓' : '✗'
        });
    }, 1000);

    function initialize() {
        console.log('Initializing canvas...');
        if (parkingImage.complete && parkingImage.naturalWidth > 0) {
            setCanvasSize();
        } else {
            parkingImage.addEventListener('load', function() {
                setTimeout(setCanvasSize, 100);
            });
        }
    }

    window.addEventListener('resize', function() {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(setCanvasSize, 100);
    });

    initialize();
    
    drawBoundingBoxes();
    
    console.log('✅ Parking Slot Management initialization complete');
});