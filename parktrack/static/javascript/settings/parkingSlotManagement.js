export function initializeParkingSlotManagement() {

    if (!document.getElementById('js-config')) return;

    // Config
    const cfg  = document.getElementById('js-config').dataset;
    const URLS = {
        getSlots:   cfg.getSlotsUrl,
        bulkSave:   cfg.bulkSaveUrl,
        updateSlot: (id) => cfg.updateSlotUrlTemplate.replace('__ID__', id),
        deleteSlot: (id) => cfg.deleteSlotUrlTemplate.replace('__ID__', id),
    };
    const CSRF = cfg.csrfToken;

    // DOM References
    const canvas          = document.getElementById('polygon-canvas');
    const ctx             = canvas.getContext('2d');
    const parkingSnapshot = document.getElementById('parking-snapshot');
    const emptyState      = document.getElementById('empty-state');
    const imageWrapper    = document.getElementById('image-wrapper');
    const drawHint        = document.getElementById('draw-hint');
    const slotsFooter     = document.getElementById('slots-footer');
    const slotsTableBody  = document.getElementById('slots-table-body');
    const slotCount       = document.getElementById('slot-count');
    const labelModal      = document.getElementById('label-modal');
    const labelInput      = document.getElementById('label-input');
    const labelError      = document.getElementById('label-error');
    const labelErrorText  = document.getElementById('label-error-text');
    const labelConfirm    = document.getElementById('label-confirm');
    const labelDiscard    = document.getElementById('label-discard');

    // State
    let slots             = [];
    let originalSlots     = [];
    let currentCameraId   = null;
    let currentMode       = 'view';
    let hasUnsavedChanges = false;
    let isDrawingPolygon  = false;
    let currentPoints     = [];
    let selectedIndex     = -1;
    let dragState         = null;

    // Modal callback refs — needed for removeEventListener
    let _modalConfirmFn   = null;
    let _modalDiscardFn   = null;
    let _modalEnterFn     = null;

    // Double-click guard state
    let lastClickTime     = 0;
    let lastClickX        = 0;
    let lastClickY        = 0;
    const DBL_MS          = 300;
    const DBL_PX          = 10;

    if (window._psmResizeHandler) {
        window.removeEventListener('resize', window._psmResizeHandler);
    }
    window._psmResizeHandler = debounce(syncCanvasSize, 120);
    window.addEventListener('resize', window._psmResizeHandler);

    if (canvas._psmHandlers) {
        const h = canvas._psmHandlers;
        canvas.removeEventListener('mousedown',  h.mousedown);
        canvas.removeEventListener('mousemove',  h.mousemove);
        canvas.removeEventListener('mouseup',    h.mouseup);
        canvas.removeEventListener('dblclick',   h.dblclick);
        canvas.removeEventListener('touchstart', h.touchstart);
        canvas.removeEventListener('touchmove',  h.touchmove);
        canvas.removeEventListener('touchend',   h.touchend);
    }

    const handlers = {
        mousedown:  (e) => onPointerDown(e),
        mousemove:  (e) => onPointerMove(e),
        mouseup:    ()  => onPointerUp(),
        dblclick:   (e) => onDoubleClick(e),
        touchstart: (e) => { e.preventDefault(); onPointerDown(e); },
        touchmove:  (e) => { e.preventDefault(); onPointerMove(e); },
        touchend:   (e) => { e.preventDefault(); onPointerUp(e); },
    };
    canvas._psmHandlers = handlers;

    canvas.addEventListener('mousedown',  handlers.mousedown);
    canvas.addEventListener('mousemove',  handlers.mousemove);
    canvas.addEventListener('mouseup',    handlers.mouseup);
    canvas.addEventListener('dblclick',   handlers.dblclick);
    canvas.addEventListener('touchstart', handlers.touchstart, { passive: false });
    canvas.addEventListener('touchmove',  handlers.touchmove,  { passive: false });
    canvas.addEventListener('touchend',   handlers.touchend,   { passive: false });

    function rebindBtn(id, handler) {
        const old = document.getElementById(id);
        if (!old) return null;
        const fresh = old.cloneNode(true);
        old.replaceWith(fresh);
        fresh.addEventListener('click', handler);
        return fresh;
    }

    rebindBtn('start-edit', enterEditingMode);
    rebindBtn('btn-add',    () => switchMode('add'));
    rebindBtn('btn-edit',   () => switchMode('edit'));
    rebindBtn('btn-delete', () => switchMode('delete'));
    rebindBtn('btn-save',   saveChanges);
    rebindBtn('btn-cancel', cancelEditing);

    const oldSelect = document.getElementById('camera-select');
    const freshSelect = oldSelect.cloneNode(true);
    oldSelect.replaceWith(freshSelect);
    freshSelect.addEventListener('change', onCameraChange);

    // Coordinate Helpers
    function toNorm(pixelX, pixelY) {
        return [
            Math.min(1, Math.max(0, pixelX / canvas.width)),
            Math.min(1, Math.max(0, pixelY / canvas.height)),
        ];
    }

    function toPx(normX, normY) {
        return [normX * canvas.width, normY * canvas.height];
    }

    // Canvas
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const src  = e.touches ? e.touches[0] : e;
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function syncCanvasSize() {
        const rect    = parkingSnapshot.getBoundingClientRect();
        canvas.width  = rect.width;
        canvas.height = rect.height;
        redraw();
    }

    const COLORS = {
        default:  { stroke: '#22c55e', fill: 'rgba(34,197,94,0.15)',  label: '#22c55e' },
        selected: { stroke: '#940B26', fill: 'rgba(148,11,38,0.20)',  label: '#940B26' },
        occupied: { stroke: '#f97316', fill: 'rgba(249,115,22,0.15)', label: '#f97316' },
        drawing:  { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.12)', label: '#3b82f6' },
    };
    const HANDLE_RADIUS = 6;

    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        slots.forEach((slot, idx) => {
            const isSelected = (currentMode === 'edit' && idx === selectedIndex);
            const palette    = isSelected ? COLORS.selected
                             : slot.status === 'occupied' ? COLORS.occupied
                             : COLORS.default;
            drawPolygon(slot.polygon_points, palette, slot.slot_label, isSelected);
        });
        if (isDrawingPolygon && currentPoints.length > 0) drawInProgressPolygon();
    }

    function drawPolygon(normPoints, palette, label, showHandles) {
        if (normPoints.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(...toPx(...normPoints[0]));
        normPoints.slice(1).forEach(pt => ctx.lineTo(...toPx(...pt)));
        ctx.closePath();

        ctx.fillStyle   = palette.fill;
        ctx.fill();
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth   = showHandles ? 2.5 : 2;
        ctx.stroke();

        const cx = normPoints.reduce((s, p) => s + p[0], 0) / normPoints.length;
        const cy = normPoints.reduce((s, p) => s + p[1], 0) / normPoints.length;
        ctx.fillStyle    = palette.label;
        ctx.font         = 'bold 13px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, ...toPx(cx, cy));

        if (showHandles) {
            normPoints.forEach(pt => {
                ctx.beginPath();
                ctx.arc(...toPx(...pt), HANDLE_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle   = '#940B26';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth   = 2;
                ctx.stroke();
            });
        }
    }

    function drawInProgressPolygon() {
        const p = COLORS.drawing;
        ctx.beginPath();
        ctx.moveTo(...toPx(...currentPoints[0]));
        currentPoints.slice(1).forEach(pt => ctx.lineTo(...toPx(...pt)));
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth   = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        currentPoints.forEach(pt => {
            ctx.beginPath();
            ctx.arc(...toPx(...pt), 4, 0, Math.PI * 2);
            ctx.fillStyle = p.stroke;
            ctx.fill();
        });

        if (currentPoints.length >= 3) {
            ctx.beginPath();
            ctx.arc(...toPx(...currentPoints[0]), HANDLE_RADIUS + 2, 0, Math.PI * 2);
            ctx.strokeStyle = p.stroke;
            ctx.lineWidth   = 2;
            ctx.stroke();
        }
    }

    // HIT Testing
    function isNearFirstPoint(nx, ny) {
        if (currentPoints.length < 3) return false;
        const [fx, fy] = currentPoints[0];
        const dx = (nx - fx) * canvas.width;
        const dy = (ny - fy) * canvas.height;
        return Math.sqrt(dx * dx + dy * dy) < HANDLE_RADIUS + 4;
    }

    function hitTestSlot(nx, ny) {
        for (let i = slots.length - 1; i >= 0; i--) {
            if (pointInPolygon(nx, ny, slots[i].polygon_points)) return i;
        }
        return -1;
    }

    function hitTestHandle(nx, ny) {
        if (selectedIndex === -1) return -1;
        const pts = slots[selectedIndex].polygon_points;
        for (let i = 0; i < pts.length; i++) {
            const [px, py] = toPx(...pts[i]);
            const [ex, ey] = toPx(nx, ny);
            if (Math.sqrt((ex-px)**2 + (ey-py)**2) <= HANDLE_RADIUS + 2) return i;
        }
        return -1;
    }

    function pointInPolygon(nx, ny, normPts) {
        let inside = false;
        for (let i = 0, j = normPts.length - 1; i < normPts.length; j = i++) {
            const [xi, yi] = normPts[i];
            const [xj, yj] = normPts[j];
            if (((yi > ny) !== (yj > ny)) &&
                (nx < (xj - xi) * (ny - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function onPointerDown(e) {
        if (currentMode === 'view') return;
        const { x, y } = getCanvasPos(e);
        const [nx, ny] = toNorm(x, y);

        if (currentMode === 'add') {
            // Guard: suppress the second mousedown that fires as part of a
            // dblclick (sequence: down→up→down→up→dblclick). Without this
            // the second down adds a ghost point before dblclick can finalise.
            const now = Date.now();
            const isSecondOfDouble = (now - lastClickTime < DBL_MS)
                                  && (Math.abs(x - lastClickX) < DBL_PX)
                                  && (Math.abs(y - lastClickY) < DBL_PX);
            lastClickTime = now;
            lastClickX    = x;
            lastClickY    = y;
            if (isSecondOfDouble) return;

            handleAddClick(nx, ny);

        } else if (currentMode === 'edit') {
            const hi = hitTestHandle(nx, ny);
            if (hi !== -1) {
                dragState = { type: 'handle', handleIndex: hi, lastNormX: nx, lastNormY: ny };
                return;
            }
            const si = hitTestSlot(nx, ny);
            selectedIndex = si;
            dragState     = si !== -1 ? { type: 'move', lastNormX: nx, lastNormY: ny } : null;
            redraw();

        } else if (currentMode === 'delete') {
            const si = hitTestSlot(nx, ny);
            if (si !== -1) {
                slots.splice(si, 1);
                selectedIndex = -1;
                markUnsaved();
                redraw();
                refreshSlotsFooter();
            }
        }
    }

    function onPointerMove(e) {
        if (currentMode !== 'edit' || !dragState) return;
        const { x, y } = getCanvasPos(e);
        const [nx, ny] = toNorm(x, y);
        const dx = nx - dragState.lastNormX;
        const dy = ny - dragState.lastNormY;

        if (dragState.type === 'move') {
            slots[selectedIndex].polygon_points =
                slots[selectedIndex].polygon_points.map(([px, py]) => [
                    Math.min(1, Math.max(0, px + dx)),
                    Math.min(1, Math.max(0, py + dy)),
                ]);
        } else if (dragState.type === 'handle') {
            const pts = slots[selectedIndex].polygon_points;
            const hi  = dragState.handleIndex;
            pts[hi]   = [
                Math.min(1, Math.max(0, pts[hi][0] + dx)),
                Math.min(1, Math.max(0, pts[hi][1] + dy)),
            ];
        }

        dragState.lastNormX = nx;
        dragState.lastNormY = ny;
        markUnsaved();
        redraw();
    }

    function onPointerUp() { dragState = null; }

    function onDoubleClick(e) {
        if (currentMode !== 'add' || !isDrawingPolygon) return;
        if (currentPoints.length >= 3) finalisePolygon();
    }

    function handleAddClick(nx, ny) {
        if (!isDrawingPolygon) {
            isDrawingPolygon = true;
            currentPoints    = [[nx, ny]];
            document.getElementById('draw-hint').classList.remove('hidden');
            redraw();
            return;
        }
        if (isNearFirstPoint(nx, ny)) { finalisePolygon(); return; }
        currentPoints.push([nx, ny]);
        redraw();
    }

    function finalisePolygon() {
        isDrawingPolygon = false;
        document.getElementById('draw-hint').classList.add('hidden');
        // Deep-clone each point — shallow spread keeps inner [x,y] references
        // shared, causing old coordinates to bleed into new polygons.
        const capturedPoints = currentPoints.map(pt => [pt[0], pt[1]]);
        currentPoints = [];
        redraw();
        openLabelModal(capturedPoints);
    }

    function openLabelModal(points) {
        labelInput.value = '';
        labelError.classList.add('hidden');
        labelModal.classList.remove('hidden');
        labelInput.focus();

        const existing = slots.map(s => s.slot_label);
        let n = slots.length + 1;
        while (existing.includes(`P${n}`)) n++;
        labelInput.value       = `P${n}`;
        labelInput.placeholder = `e.g. P${n}`;

        // Remove previous listeners by stored reference — keeps DOM nodes
        // intact unlike cloneNode, which would break our const references.
        if (_modalConfirmFn) {
            labelConfirm.removeEventListener('click',  _modalConfirmFn);
            labelDiscard.removeEventListener('click',  _modalDiscardFn);
            labelInput.removeEventListener('keydown',  _modalEnterFn);
        }

        _modalConfirmFn = function () {
            const label = labelInput.value.trim();
            if (!label) { showLabelError('Please enter a slot label.'); return; }
            if (slots.some(s => s.slot_label === label)) {
                showLabelError(`"${label}" is already used. Choose a different label.`);
                return;
            }
            closeLabelModal();
            slots.push({ id: null, slot_label: label, polygon_points: points, status: 'available' });
            markUnsaved();
            redraw();
            refreshSlotsFooter();
        };

        _modalDiscardFn = function () { closeLabelModal(); redraw(); };
        _modalEnterFn   = function (e) { if (e.key === 'Enter') _modalConfirmFn(); };

        labelConfirm.addEventListener('click',  _modalConfirmFn);
        labelDiscard.addEventListener('click',  _modalDiscardFn);
        labelInput.addEventListener('keydown',  _modalEnterFn);
    }

    function showLabelError(msg) {
        labelErrorText.textContent = msg;
        labelError.classList.remove('hidden');
    }

    function closeLabelModal() { labelModal.classList.add('hidden'); }

    function refreshSlotsFooter() {
        if (slots.length === 0) { slotsFooter.classList.add('hidden'); return; }
        slotsFooter.classList.remove('hidden');
        slotCount.textContent    = slots.length;
        slotsTableBody.innerHTML = '';

        slots.forEach((slot, idx) => {
            const tag = document.createElement('div');
            const occupied = slot.status === 'occupied';
            tag.className = [
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors',
                occupied ? 'border-orange-300 bg-orange-50 text-orange-700'
                         : 'border-green-300 bg-green-50 text-green-700',
            ].join(' ');
            tag.innerHTML = `
                <span class="w-2 h-2 rounded-full inline-block ${occupied ? 'bg-orange-400' : 'bg-green-400'}"></span>
                ${escHtml(slot.slot_label)}
                ${slot.id === null ? '<span class="text-xs font-normal text-gray-400">(new)</span>' : ''}
            `;
            tag.addEventListener('click', () => {
                if (currentMode === 'edit') { selectedIndex = idx; redraw(); }
            });
            slotsTableBody.appendChild(tag);
        });
    }

    // API Calls
    async function fetchSlots(cameraId) {
        try {
            const res  = await fetch(`${URLS.getSlots}?camera_id=${cameraId}`);
            const data = await res.json();
            return data.success ? data.slots : [];
        } catch (err) {
            console.error('fetchSlots failed:', err);
            return [];
        }
    }

    async function bulkSaveSlots(cameraId, slotsToSave) {
        const res = await fetch(URLS.bulkSave, {
            method:  'POST',
            headers: {
                'Content-Type':     'application/json',
                'X-CSRFToken':      CSRF,
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                camera_id: cameraId,
                slots: slotsToSave.map(s => ({
                    slot_label:     s.slot_label,
                    polygon_points: s.polygon_points,
                })),
            }),
        });
        return res.json();
    }

    // Camera Selection
    async function onCameraChange() {
        const select = document.getElementById('camera-select');
        const option = select.options[select.selectedIndex];
        const camId  = select.value;

        if (!camId) { resetEditorToEmpty(); return; }

        if (currentMode !== 'view' && hasUnsavedChanges) {
            const confirmed = await confirmDiscard();
            if (!confirmed) { select.value = currentCameraId; return; }
        }

        currentCameraId = camId;
        showCameraStatus('loading', 'Loading…');
        loadSnapshot(option.dataset.snapshot || '');

        const fetched     = await fetchSlots(camId);
        slots             = fetched;
        originalSlots     = deepClone(fetched);
        hasUnsavedChanges = false;

        exitEditingMode();
        refreshSlotsFooter();
        showCameraStatus('ready', option.dataset.name || 'Camera ready');
        document.getElementById('start-edit').disabled = false;
    }

    function loadSnapshot(url) {
        emptyState.classList.add('hidden');
        imageWrapper.classList.remove('hidden');

        if (url) {
            parkingSnapshot.src    = url;
            parkingSnapshot.onload = () => { syncCanvasSize(); redraw(); };
        } else {
            parkingSnapshot.removeAttribute('src');
            parkingSnapshot.style.cssText = 'width:100%;height:400px;background:#1f2937;display:block;';
            syncCanvasSize();
            redraw();
        }
    }

    function resetEditorToEmpty() {
        currentCameraId   = null;
        slots             = [];
        originalSlots     = [];
        hasUnsavedChanges = false;
        selectedIndex     = -1;
        isDrawingPolygon  = false;
        currentPoints     = [];

        emptyState.classList.remove('hidden');
        imageWrapper.classList.add('hidden');
        slotsFooter.classList.add('hidden');
        document.getElementById('camera-status').classList.add('hidden');
        document.getElementById('start-edit').disabled = true;

        exitEditingMode();
    }

    function enterEditingMode() {
        originalSlots     = deepClone(slots);
        hasUnsavedChanges = false;

        document.getElementById('toolbar-view').classList.add('hidden');
        const te = document.getElementById('toolbar-edit');
        te.classList.remove('hidden');
        te.classList.add('flex');
        document.getElementById('instructions-bar').classList.remove('hidden');

        switchMode('edit');
    }

    function exitEditingMode() {
        currentMode      = 'view';
        isDrawingPolygon = false;
        currentPoints    = [];
        selectedIndex    = -1;
        dragState        = null;

        document.getElementById('toolbar-view').classList.remove('hidden');
        const te = document.getElementById('toolbar-edit');
        te.classList.add('hidden');
        te.classList.remove('flex');
        document.getElementById('instructions-bar').classList.add('hidden');
        document.getElementById('unsaved-badge').classList.add('hidden');
        document.getElementById('draw-hint').classList.add('hidden');

        canvas.style.cursor = 'default';
        redraw();
    }

    function switchMode(mode) {
        currentMode      = mode;
        isDrawingPolygon = false;
        currentPoints    = [];
        selectedIndex    = -1;
        dragState        = null;

        const modeConfig = {
            add:    { label: 'Add Slot',       dot: 'bg-emerald-500', cursor: 'crosshair'   },
            edit:   { label: 'Move / Reshape', dot: 'bg-blue-500',    cursor: 'pointer'     },
            delete: { label: 'Delete Slot',    dot: 'bg-red-500',     cursor: 'not-allowed' },
        };
        const mc = modeConfig[mode];

        document.getElementById('mode-label').textContent = mc.label;
        document.getElementById('mode-dot').className     = `w-1.5 h-1.5 rounded-full ${mc.dot}`;
        canvas.style.cursor = mc.cursor;

        ['btn-add', 'btn-edit', 'btn-delete'].forEach(id => {
            document.getElementById(id)?.classList.remove('ring-2', 'ring-offset-1', 'ring-[#940B26]');
        });
        const activeId = { add: 'btn-add', edit: 'btn-edit', delete: 'btn-delete' }[mode];
        document.getElementById(activeId)?.classList.add('ring-2', 'ring-offset-1', 'ring-[#940B26]');

        document.getElementById('draw-hint').classList.toggle('hidden', mode !== 'add');
        redraw();
    }

    async function saveChanges() {
        if (!currentCameraId) return;

        const btn = document.getElementById('btn-save');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

        try {
            const result = await bulkSaveSlots(currentCameraId, slots);
            if (result.success) {
                slots         = result.slots;
                originalSlots = deepClone(result.slots);
                clearUnsaved();
                refreshSlotsFooter();
                exitEditingMode();
                Swal.fire({ title: 'Saved!', text: result.message, icon: 'success',
                    confirmButtonText: 'OK', confirmButtonColor: '#940B26' });
            } else {
                Swal.fire({ title: 'Save Failed', text: result.error || 'Something went wrong.',
                    icon: 'error', confirmButtonText: 'OK', confirmButtonColor: '#940B26' });
            }
        } catch {
            Swal.fire({ title: 'Error', text: 'Could not reach the server. Please try again.',
                icon: 'error', confirmButtonText: 'OK', confirmButtonColor: '#940B26' });
        } finally {
            const b = document.getElementById('btn-save');
            if (b) { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save'; }
        }
    }

    async function cancelEditing() {
        if (hasUnsavedChanges && !(await confirmDiscard())) return;
        slots = deepClone(originalSlots);
        clearUnsaved();
        refreshSlotsFooter();
        exitEditingMode();
    }

    function confirmDiscard() {
        return Swal.fire({
            title: 'Discard Changes?',
            text: 'You have unsaved changes. Are you sure you want to discard them?',
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'Yes, Discard', cancelButtonText: 'Keep Editing',
            confirmButtonColor: '#940B26', cancelButtonColor: '#6b7280',
        }).then(r => r.isConfirmed);
    }

    // Unsaved/Status Helper
    function markUnsaved() {
        hasUnsavedChanges = true;
        const b = document.getElementById('unsaved-badge');
        b.classList.remove('hidden'); b.classList.add('flex');
    }

    function clearUnsaved() {
        hasUnsavedChanges = false;
        const b = document.getElementById('unsaved-badge');
        b.classList.add('hidden'); b.classList.remove('flex');
    }

    function showCameraStatus(state, text) {
        const cs  = document.getElementById('camera-status');
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('status-text');
        cs.classList.remove('hidden'); cs.classList.add('flex');
        txt.textContent = text;
        dot.className = `w-2 h-2 rounded-full inline-block ${{
            loading: 'bg-yellow-400 animate-pulse',
            ready:   'bg-green-500',
            error:   'bg-red-500',
        }[state] || 'bg-gray-400'}`;
    }

    // Utilities
    function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

    function debounce(fn, ms) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    function escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    resetEditorToEmpty();
}