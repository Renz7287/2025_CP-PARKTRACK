document.addEventListener('DOMContentLoaded', function() {
    const parkingImage = document.getElementById('parking-image');
    const canvas = document.getElementById('bounding-canvas');
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
        
        console.log('Image natural size:', imageWidth, 'x', imageHeight);
        console.log('Image displayed size:', imgRect.width, 'x', imgRect.height);
        console.log('Scale factors:', scaleX, scaleY);
        
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

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);

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

        console.log('Pointer down - Screen:', screenX, screenY, 'Image:', imageCoords.x, imageCoords.y);

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
                console.log('Added box:', normalizedBox);
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
        currentMode = 'add';
        modeIndicator.textContent = 'Mode: Add Parking Slot';
        canvas.style.cursor = 'crosshair';
        selectedBoxIndex = -1;
        updateSelectedInfo();
        drawBoundingBoxes();
    }

    function switchToEditMode() {
        currentMode = 'edit';
        modeIndicator.textContent = 'Mode: Edit Parking Slot';
        canvas.style.cursor = 'pointer';
        drawBoundingBoxes();
    }

    function switchToDeleteMode() {
        currentMode = 'delete';
        modeIndicator.textContent = 'Mode: Delete Parking Slot';
        canvas.style.cursor = 'not-allowed';
        selectedBoxIndex = -1;
        updateSelectedInfo();
        drawBoundingBoxes();
    }

    function saveChanges() {
        console.log('Saving parking slots:', boundingBoxes);
        
        Swal.fire({
            title: 'Success!',
            text: 'Parking slots have been saved successfully.',
            icon: 'success',
            confirmButtonText: 'OK'
        });
        
        clearUnsavedChanges();
        exitEditing();
    }

    function cancelEditing() {
        if (hasUnsavedChanges) {
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
            exitEditing();
        }
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

    startEditBtn.addEventListener('click', startEditing);
    addButton.addEventListener('click', switchToAddMode);
    editButton.addEventListener('click', switchToEditMode);
    deleteButton.addEventListener('click', switchToDeleteMode);
    saveButton.addEventListener('click', saveChanges);
    cancelButton.addEventListener('click', cancelEditing);

    function initialize() {
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

    boundingBoxes = [];
});