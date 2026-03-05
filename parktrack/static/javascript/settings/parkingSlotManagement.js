export function initializeParkingSlotManagement() {

    if (!document.getElementById('js-config')) return;

    const cfg  = document.getElementById('js-config').dataset;
    const URLS = {
        getSlots:       cfg.getSlotsUrl,
        bulkSave:       cfg.bulkSaveUrl,
        getCamera:      cfg.getCameraUrl,
        editCamera:     (id) => cfg.editCameraUrlTemplate.replace('__ID__', id),
        uploadSnapshot: (id) => cfg.uploadSnapshotUrlTemplate.replace('__ID__', id),
        cleanStream:    (id) => cfg.cleanStreamUrlTemplate.replace('__ID__', id),
        captureSnapshot:(id) => cfg.captureSnapshotUrlTemplate.replace('__ID__', id),
    };
    const CSRF = cfg.csrfToken;

    const canvas          = document.getElementById('polygon-canvas');
    const ctx             = canvas.getContext('2d');
    const parkingSnapshot = document.getElementById('parking-snapshot');
    const emptyState      = document.getElementById('empty-state');
    const imageWrapper    = document.getElementById('image-wrapper');
    const slotsFooter     = document.getElementById('slots-footer');
    const slotsTableBody  = document.getElementById('slots-table-body');
    const slotCount       = document.getElementById('slot-count');
    const labelModal      = document.getElementById('label-modal');
    const labelInput      = document.getElementById('label-input');
    const labelError      = document.getElementById('label-error');
    const labelErrorText  = document.getElementById('label-error-text');
    const labelConfirm    = document.getElementById('label-confirm');
    const labelDiscard    = document.getElementById('label-discard');

    let camera            = null;
    let slots             = [];
    let originalSlots     = [];
    let currentMode       = 'view';
    let hasUnsavedChanges = false;
    let isDrawingPolygon  = false;
    let currentPoints     = [];
    let selectedIndex     = -1;
    let dragState         = null;
    let _modalConfirmFn   = null;
    let _modalDiscardFn   = null;
    let _modalEnterFn     = null;
    let lastClickTime     = 0;
    let lastClickX        = 0;
    let lastClickY        = 0;
    const DBL_MS          = 300;
    const DBL_PX          = 10;

    if (window._psmResizeHandler) window.removeEventListener('resize', window._psmResizeHandler);
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
    const _handlers = {
        mousedown:  (e) => onPointerDown(e),
        mousemove:  (e) => onPointerMove(e),
        mouseup:    ()  => onPointerUp(),
        dblclick:   (e) => onDoubleClick(e),
        touchstart: (e) => { e.preventDefault(); onPointerDown(e); },
        touchmove:  (e) => { e.preventDefault(); onPointerMove(e); },
        touchend:   (e) => { e.preventDefault(); onPointerUp(e); },
    };
    canvas._psmHandlers = _handlers;
    canvas.addEventListener('mousedown',  _handlers.mousedown);
    canvas.addEventListener('mousemove',  _handlers.mousemove);
    canvas.addEventListener('mouseup',    _handlers.mouseup);
    canvas.addEventListener('dblclick',   _handlers.dblclick);
    canvas.addEventListener('touchstart', _handlers.touchstart, { passive: false });
    canvas.addEventListener('touchmove',  _handlers.touchmove,  { passive: false });
    canvas.addEventListener('touchend',   _handlers.touchend,   { passive: false });

    function rebind(id, fn) {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener('click', fn);
    }

    rebind('start-edit',          enterEditingMode);
    rebind('btn-add',             () => switchMode('add'));
    rebind('btn-edit',            () => switchMode('edit'));
    rebind('btn-delete',          () => switchMode('delete'));
    rebind('btn-save',            saveChanges);
    rebind('btn-cancel',          cancelEditing);
    rebind('btn-upload-snapshot', () => openSnapshotModal());
    rebind('btn-edit-camera',     () => openEditCameraModal());

    function toNorm(px, py) {
        return [Math.min(1, Math.max(0, px / canvas.width)),
                Math.min(1, Math.max(0, py / canvas.height))];
    }
    function toPx(nx, ny) { return [nx * canvas.width, ny * canvas.height]; }
    function getCanvasPos(e) {
        const r = canvas.getBoundingClientRect();
        const s = e.touches ? e.touches[0] : e;
        return { x: s.clientX - r.left, y: s.clientY - r.top };
    }
    function syncCanvasSize() {
        const r = parkingSnapshot.getBoundingClientRect();
        canvas.width  = r.width;
        canvas.height = r.height;
        redraw();
    }

    const COLORS = {
        default:  { stroke: '#22c55e', fill: 'rgba(34,197,94,0.15)',  label: '#22c55e' },
        selected: { stroke: '#940B26', fill: 'rgba(148,11,38,0.20)',  label: '#940B26' },
        occupied: { stroke: '#f97316', fill: 'rgba(249,115,22,0.15)', label: '#f97316' },
        drawing:  { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.12)', label: '#3b82f6' },
    };
    const HR = 6;

    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        slots.forEach((slot, idx) => {
            const sel = (currentMode === 'edit' && idx === selectedIndex);
            drawPolygon(slot.polygon_points,
                sel ? COLORS.selected : slot.status === 'occupied' ? COLORS.occupied : COLORS.default,
                slot.slot_label, sel);
        });
        if (isDrawingPolygon && currentPoints.length > 0) drawInProgress();
    }

    function drawPolygon(pts, pal, label, handles) {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(...toPx(...pts[0]));
        pts.slice(1).forEach(p => ctx.lineTo(...toPx(...p)));
        ctx.closePath();
        ctx.fillStyle = pal.fill; ctx.fill();
        ctx.strokeStyle = pal.stroke; ctx.lineWidth = handles ? 2.5 : 2; ctx.stroke();
        const cx = pts.reduce((s,p) => s+p[0], 0) / pts.length;
        const cy = pts.reduce((s,p) => s+p[1], 0) / pts.length;
        ctx.fillStyle = pal.label; ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, ...toPx(cx, cy));
        if (handles) {
            pts.forEach(p => {
                ctx.beginPath(); ctx.arc(...toPx(...p), HR, 0, Math.PI*2);
                ctx.fillStyle = '#940B26'; ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            });
        }
    }

    function drawInProgress() {
        const p = COLORS.drawing;
        ctx.beginPath(); ctx.moveTo(...toPx(...currentPoints[0]));
        currentPoints.slice(1).forEach(pt => ctx.lineTo(...toPx(...pt)));
        ctx.strokeStyle = p.stroke; ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        currentPoints.forEach(pt => {
            ctx.beginPath(); ctx.arc(...toPx(...pt), 4, 0, Math.PI*2);
            ctx.fillStyle = p.stroke; ctx.fill();
        });
        if (currentPoints.length >= 3) {
            ctx.beginPath(); ctx.arc(...toPx(...currentPoints[0]), HR+2, 0, Math.PI*2);
            ctx.strokeStyle = p.stroke; ctx.lineWidth = 2; ctx.stroke();
        }
    }

    function isNearFirst(nx, ny) {
        if (currentPoints.length < 3) return false;
        const [fx, fy] = currentPoints[0];
        return Math.hypot((nx-fx)*canvas.width, (ny-fy)*canvas.height) < HR+4;
    }
    function hitSlot(nx, ny) {
        for (let i = slots.length-1; i >= 0; i--)
            if (pip(nx, ny, slots[i].polygon_points)) return i;
        return -1;
    }
    function hitHandle(nx, ny) {
        if (selectedIndex === -1) return -1;
        const pts = slots[selectedIndex].polygon_points;
        for (let i = 0; i < pts.length; i++) {
            const [px,py] = toPx(...pts[i]), [ex,ey] = toPx(nx,ny);
            if (Math.hypot(ex-px, ey-py) <= HR+2) return i;
        }
        return -1;
    }
    function pip(nx, ny, pts) {
        let inside = false;
        for (let i=0, j=pts.length-1; i<pts.length; j=i++) {
            const [xi,yi]=pts[i],[xj,yj]=pts[j];
            if (((yi>ny)!==(yj>ny)) && (nx < (xj-xi)*(ny-yi)/(yj-yi)+xi))
                inside = !inside;
        }
        return inside;
    }

    function onPointerDown(e) {
        if (currentMode === 'view') return;
        const {x, y} = getCanvasPos(e);
        const [nx, ny] = toNorm(x, y);
        if (currentMode === 'add') {
            const now = Date.now();
            const second = (now-lastClickTime < DBL_MS) && (Math.abs(x-lastClickX) < DBL_PX) && (Math.abs(y-lastClickY) < DBL_PX);
            lastClickTime = now; lastClickX = x; lastClickY = y;
            if (second) return;
            handleAdd(nx, ny);
        } else if (currentMode === 'edit') {
            const hi = hitHandle(nx, ny);
            if (hi !== -1) { dragState = {type:'handle', handleIndex:hi, lastNormX:nx, lastNormY:ny}; return; }
            const si = hitSlot(nx, ny);
            selectedIndex = si;
            dragState = si !== -1 ? {type:'move', lastNormX:nx, lastNormY:ny} : null;
            redraw();
        } else if (currentMode === 'delete') {
            const si = hitSlot(nx, ny);
            if (si !== -1) { slots.splice(si,1); selectedIndex=-1; markUnsaved(); redraw(); refreshFooter(); }
        }
    }

    function onPointerMove(e) {
        if (currentMode !== 'edit' || !dragState) return;
        const {x, y} = getCanvasPos(e);
        const [nx, ny] = toNorm(x, y);
        const dx = nx-dragState.lastNormX, dy = ny-dragState.lastNormY;
        if (dragState.type === 'move') {
            slots[selectedIndex].polygon_points = slots[selectedIndex].polygon_points.map(
                ([px,py]) => [Math.min(1,Math.max(0,px+dx)), Math.min(1,Math.max(0,py+dy))]);
        } else {
            const pts = slots[selectedIndex].polygon_points, hi = dragState.handleIndex;
            pts[hi] = [Math.min(1,Math.max(0,pts[hi][0]+dx)), Math.min(1,Math.max(0,pts[hi][1]+dy))];
        }
        dragState.lastNormX = nx; dragState.lastNormY = ny;
        markUnsaved(); redraw();
    }

    function onPointerUp()  { dragState = null; }
    function onDoubleClick(e) {
        if (currentMode !== 'add' || !isDrawingPolygon) return;
        if (currentPoints.length >= 3) finalise();
    }

    function handleAdd(nx, ny) {
        if (!isDrawingPolygon) {
            isDrawingPolygon = true; currentPoints = [[nx,ny]];
            document.getElementById('draw-hint').classList.remove('hidden');
            redraw(); return;
        }
        if (isNearFirst(nx, ny)) { finalise(); return; }
        currentPoints.push([nx, ny]); redraw();
    }

    function finalise() {
        isDrawingPolygon = false;
        document.getElementById('draw-hint').classList.add('hidden');
        const captured = currentPoints.map(p => [p[0], p[1]]);
        currentPoints = []; redraw();
        openLabelModal(captured);
    }

    function openLabelModal(points) {
        labelInput.value = ''; labelError.classList.add('hidden');
        labelModal.classList.remove('hidden'); labelInput.focus();
        const existing = slots.map(s => s.slot_label);
        let n = slots.length + 1;
        while (existing.includes(`P${n}`)) n++;
        labelInput.value = `P${n}`; labelInput.placeholder = `e.g. P${n}`;
        if (_modalConfirmFn) {
            labelConfirm.removeEventListener('click', _modalConfirmFn);
            labelDiscard.removeEventListener('click', _modalDiscardFn);
            labelInput.removeEventListener('keydown', _modalEnterFn);
        }
        _modalConfirmFn = () => {
            const label = labelInput.value.trim();
            if (!label) { showLabelErr('Please enter a slot label.'); return; }
            if (slots.some(s => s.slot_label === label)) { showLabelErr(`"${label}" is already used.`); return; }
            closeLabelModal();
            slots.push({id:null, slot_label:label, polygon_points:points, status:'available'});
            markUnsaved(); redraw(); refreshFooter();
        };
        _modalDiscardFn = () => { closeLabelModal(); redraw(); };
        _modalEnterFn   = (e) => { if (e.key === 'Enter') _modalConfirmFn(); };
        labelConfirm.addEventListener('click', _modalConfirmFn);
        labelDiscard.addEventListener('click', _modalDiscardFn);
        labelInput.addEventListener('keydown', _modalEnterFn);
    }

    function showLabelErr(msg) { labelErrorText.textContent = msg; labelError.classList.remove('hidden'); }
    function closeLabelModal()  { labelModal.classList.add('hidden'); }

    function openRenameModal(index) {
        const slot = slots[index];
        if (!slot) return;

        // Reuse the label modal but in rename mode
        labelInput.value = slot.slot_label;
        labelError.classList.add('hidden');
        labelModal.classList.remove('hidden');
        labelInput.focus();
        labelInput.select();

        // Update modal title to indicate rename
        const modalTitle = labelModal.querySelector('h3, p, .modal-title');

        if (_modalConfirmFn) {
            labelConfirm.removeEventListener('click', _modalConfirmFn);
            labelDiscard.removeEventListener('click', _modalDiscardFn);
            labelInput.removeEventListener('keydown', _modalEnterFn);
        }

        _modalConfirmFn = () => {
            const newLabel = labelInput.value.trim();
            if (!newLabel) { showLabelErr('Please enter a slot label.'); return; }
            if (newLabel !== slot.slot_label && slots.some(s => s.slot_label === newLabel)) {
                showLabelErr(`"${newLabel}" is already used.`); return;
            }
            slot.slot_label = newLabel;
            closeLabelModal();
            markUnsaved(); redraw(); refreshFooter();
        };
        _modalDiscardFn = () => { closeLabelModal(); };
        _modalEnterFn   = (e) => { if (e.key === 'Enter') _modalConfirmFn(); };

        labelConfirm.addEventListener('click', _modalConfirmFn);
        labelDiscard.addEventListener('click', _modalDiscardFn);
        labelInput.addEventListener('keydown', _modalEnterFn);
    }

    function refreshFooter() {
        if (slots.length === 0) { slotsFooter.classList.add('hidden'); return; }
        slotsFooter.classList.remove('hidden');
        slotCount.textContent = slots.length;
        slotsTableBody.innerHTML = '';
        slots.forEach((slot, idx) => {
            const occ = slot.status === 'occupied';
            const tag = document.createElement('div');
            tag.className = [
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                occ ? 'border-orange-300 bg-orange-50 text-orange-700'
                    : 'border-green-300 bg-green-50 text-green-700',
            ].join(' ');

            tag.innerHTML = `
                <span class="w-2 h-2 rounded-full inline-block shrink-0 ${occ ? 'bg-orange-400' : 'bg-green-400'}"></span>
                <span class="flex-1 cursor-pointer" data-select="${idx}">
                    ${esc(slot.slot_label)}
                    ${slot.id === null ? '<span class="text-xs font-normal text-gray-400 ml-1">(new)</span>' : ''}
                </span>
                <button
                    data-rename="${idx}"
                    title="Rename slot"
                    class="ml-auto shrink-0 opacity-50 hover:opacity-100 transition-opacity p-0.5 rounded"
                >
                    <i class="fa-solid fa-pen text-xs"></i>
                </button>`;

            // Select slot on label click (edit mode)
            tag.querySelector(`[data-select="${idx}"]`).addEventListener('click', () => {
                if (currentMode === 'edit') { selectedIndex = idx; redraw(); }
            });

            // Rename on pencil click (always available when in edit toolbar)
            tag.querySelector(`[data-rename="${idx}"]`).addEventListener('click', (e) => {
                e.stopPropagation();
                openRenameModal(idx);
            });

            slotsTableBody.appendChild(tag);
        });
    }

    async function loadCamera() {
        try {
            const r = await fetch(URLS.getCamera);
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'Camera not found.');
            camera = d.camera;
            document.getElementById('camera-label').textContent =
                camera.name + (camera.location ? ` — ${camera.location}` : '');
            await loadSnapshotAsync(camera.snapshot_url || '');
            const fetched = await fetchSlots(camera.id);
            slots = fetched; originalSlots = clone(fetched);
            syncCanvasSize(); refreshFooter(); redraw();
        } catch(e) {
            emptyState.innerHTML = `
                <i class="fa-solid fa-circle-exclamation text-4xl mb-4 opacity-50 text-red-400"></i>
                <p class="text-lg font-medium text-red-400">Failed to load camera</p>
                <p class="text-sm mt-1">${esc(e.message)}</p>`;
            emptyState.classList.remove('hidden');
        }
    }

    async function fetchSlots(cameraId) {
        try {
            const r = await fetch(`${URLS.getSlots}?camera_id=${cameraId}`);
            const d = await r.json();
            return d.success ? d.slots : [];
        } catch { return []; }
    }

    async function bulkSave(cameraId, slotsToSave) {
        const r = await fetch(URLS.bulkSave, {
            method: 'POST',
            headers: {'Content-Type':'application/json','X-CSRFToken':CSRF,'X-Requested-With':'XMLHttpRequest'},
            body: JSON.stringify({camera_id:cameraId, slots:slotsToSave.map(s=>({slot_label:s.slot_label,polygon_points:s.polygon_points}))}),
        });
        return r.json();
    }

    function loadSnapshotAsync(url) {
        emptyState.classList.add('hidden');
        imageWrapper.classList.remove('hidden');
        return new Promise(resolve => {
            if (!url) {
                parkingSnapshot.removeAttribute('src');
                parkingSnapshot.style.cssText = 'width:100%;height:400px;background:#1f2937;display:block;';
                syncCanvasSize(); resolve(); return;
            }
            parkingSnapshot.style.cssText = '';
            parkingSnapshot.onload  = () => { syncCanvasSize(); resolve(); };
            parkingSnapshot.onerror = () => {
                parkingSnapshot.style.cssText = 'width:100%;height:400px;background:#1f2937;display:block;';
                syncCanvasSize(); resolve();
            };
            parkingSnapshot.src = url;
            // Only use complete shortcut if src matches exactly (no cache-bust mismatch)
            const currentBase = parkingSnapshot.src.split('?')[0];
            const newBase     = url.split('?')[0];
            if (currentBase !== newBase && parkingSnapshot.complete && parkingSnapshot.naturalWidth > 0) {
                parkingSnapshot.onload = null; parkingSnapshot.onerror = null;
                syncCanvasSize(); resolve();
            }
        });
    }

    function enterEditingMode() {
        originalSlots = clone(slots); hasUnsavedChanges = false;
        document.getElementById('toolbar-view').classList.add('hidden');
        const te = document.getElementById('toolbar-edit');
        te.classList.remove('hidden'); te.classList.add('flex');
        document.getElementById('instructions-bar').classList.remove('hidden');
        switchMode('edit');
    }

    function exitEdit() {
        currentMode = 'view'; isDrawingPolygon = false;
        currentPoints = []; selectedIndex = -1; dragState = null;
        document.getElementById('toolbar-view').classList.remove('hidden');
        const te = document.getElementById('toolbar-edit');
        te.classList.add('hidden'); te.classList.remove('flex');
        document.getElementById('instructions-bar').classList.add('hidden');
        document.getElementById('unsaved-badge').classList.add('hidden');
        document.getElementById('draw-hint').classList.add('hidden');
        canvas.style.cursor = 'default'; redraw();
    }

    function switchMode(mode) {
        currentMode = mode; isDrawingPolygon = false;
        currentPoints = []; selectedIndex = -1; dragState = null;
        const MC = {
            add:    {label:'Add Slot',       dot:'bg-emerald-500', cur:'crosshair'},
            edit:   {label:'Move / Reshape', dot:'bg-blue-500',    cur:'pointer'},
            delete: {label:'Delete Slot',    dot:'bg-red-500',     cur:'not-allowed'},
        }[mode];
        document.getElementById('mode-label').textContent = MC.label;
        document.getElementById('mode-dot').className     = `w-1.5 h-1.5 rounded-full ${MC.dot}`;
        canvas.style.cursor = MC.cur;
        ['btn-add','btn-edit','btn-delete'].forEach(id =>
            document.getElementById(id)?.classList.remove('ring-2','ring-offset-1','ring-[#940B26]'));
        document.getElementById({add:'btn-add',edit:'btn-edit',delete:'btn-delete'}[mode])
            ?.classList.add('ring-2','ring-offset-1','ring-[#940B26]');
        document.getElementById('draw-hint').classList.toggle('hidden', mode !== 'add');
        redraw();
    }

    async function saveChanges() {
        if (!camera) return;
        const btn = document.getElementById('btn-save');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        try {
            const result = await bulkSave(camera.id, slots);
            if (result.success) {
                slots = result.slots; originalSlots = clone(result.slots);
                clearUnsaved(); refreshFooter(); exitEdit();
                swal('Saved!', result.message, 'success');
            } else {
                swal('Save Failed', result.error||'Something went wrong.', 'error');
            }
        } catch { swal('Error', 'Could not reach the server.', 'error'); }
        finally {
            const b = document.getElementById('btn-save');
            if (b) { b.disabled=false; b.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Save'; }
        }
    }

    async function cancelEditing() {
        if (hasUnsavedChanges && !(await confirmDiscard())) return;
        slots = clone(originalSlots); clearUnsaved(); refreshFooter(); exitEdit();
    }

    function confirmDiscard() {
        return Swal.fire({
            title:'Discard Changes?', text:'You have unsaved changes.',
            icon:'warning', showCancelButton:true,
            confirmButtonText:'Yes, Discard', cancelButtonText:'Keep Editing',
            confirmButtonColor:'#940B26', cancelButtonColor:'#6b7280',
        }).then(r => r.isConfirmed);
    }

    function swal(title, text, icon) {
        Swal.fire({title, text, icon, confirmButtonText:'OK', confirmButtonColor:'#940B26'});
    }

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

    // Edit Camera modal

    function openEditCameraModal() {
        if (!camera) return;
        document.getElementById('edit-camera-id').value         = camera.id;
        document.getElementById('edit-camera-name').value       = camera.name;
        document.getElementById('edit-camera-location').value   = camera.location || '';
        document.getElementById('edit-camera-stream-url').value = camera.stream_url || '';
        document.getElementById('edit-camera-error').classList.add('hidden');
        document.getElementById('edit-camera-modal').classList.remove('hidden');
    }
    function closeEditCameraModal() {
        document.getElementById('edit-camera-modal').classList.add('hidden');
    }

    rebind('btn-edit-camera-cancel', closeEditCameraModal);
    document.getElementById('edit-camera-modal').addEventListener('click', function(e) {
        if (e.target === this) closeEditCameraModal();
    });

    rebind('btn-edit-camera-save', async () => {
        const id        = document.getElementById('edit-camera-id').value;
        const name      = document.getElementById('edit-camera-name').value.trim();
        const location  = document.getElementById('edit-camera-location').value.trim();
        const streamUrl = document.getElementById('edit-camera-stream-url').value.trim();
        const errDiv    = document.getElementById('edit-camera-error');
        const errTxt    = document.getElementById('edit-camera-error-text');
        errDiv.classList.add('hidden');

        if (!name) { errTxt.textContent = 'Camera name is required.'; errDiv.classList.remove('hidden'); return; }

        const btn = document.getElementById('btn-edit-camera-save');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

        try {
            const r = await fetch(URLS.editCamera(id), {
                method: 'POST',
                headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
                body: JSON.stringify({name, location, stream_url: streamUrl}),
            });
            const d = await r.json();
            if (d.success) {
                camera.name       = d.camera.name;
                camera.location   = d.camera.location;
                camera.stream_url = d.camera.stream_url;
                document.getElementById('camera-label').textContent =
                    camera.name + (camera.location ? ` — ${camera.location}` : '');
                closeEditCameraModal();
                swal('Saved!', 'Camera settings updated.', 'success');
            } else {
                errTxt.textContent = d.error||'Failed to update camera.';
                errDiv.classList.remove('hidden');
            }
        } catch { errTxt.textContent = 'Server error. Please try again.'; errDiv.classList.remove('hidden'); }
        finally {
            const b = document.getElementById('btn-edit-camera-save');
            if (b) { b.disabled=false; b.innerHTML='Save Changes'; }
        }
    });

    // Snapshot modal

    const tabUpload    = document.getElementById('tab-upload');
    const tabCapture   = document.getElementById('tab-capture');
    const panelUpload  = document.getElementById('panel-upload');
    const panelCapture = document.getElementById('panel-capture');

    let _hlsInstance = null;

    function stopCleanStream() {
        const video = document.getElementById('capture-video');
        if (_hlsInstance) { _hlsInstance.destroy(); _hlsInstance = null; }
        if (video) { video.pause(); video.src = ''; video.classList.add('hidden'); }
    }

    function activateTab(tab) {
        const isUpload = tab === 'upload';
        tabUpload.classList.toggle('bg-white',      isUpload);
        tabUpload.classList.toggle('shadow-sm',     isUpload);
        tabUpload.classList.toggle('text-gray-800', isUpload);
        tabUpload.classList.toggle('text-gray-500', !isUpload);
        tabCapture.classList.toggle('bg-white',     !isUpload);
        tabCapture.classList.toggle('shadow-sm',    !isUpload);
        tabCapture.classList.toggle('text-gray-800',!isUpload);
        tabCapture.classList.toggle('text-gray-500', isUpload);
        panelUpload.classList.toggle('hidden',  !isUpload);
        panelCapture.classList.toggle('hidden',  isUpload);
        if (!isUpload) {
            stopCleanStream();
            document.getElementById('capture-idle').classList.remove('hidden');
            document.getElementById('capture-loading').classList.add('hidden');
            document.getElementById('capture-video').classList.add('hidden');
            document.getElementById('capture-preview-img').classList.add('hidden');
            document.getElementById('capture-error').classList.add('hidden');
            document.getElementById('btn-capture-use').disabled = true;
            document.getElementById('btn-capture-snap').innerHTML = '<i class="fa-solid fa-play"></i> Start Live Preview';
        }
    }

    tabUpload.addEventListener('click',  () => activateTab('upload'));
    tabCapture.addEventListener('click', () => activateTab('capture'));

    function openSnapshotModal() {
        if (!camera) return;
        document.getElementById('snapshot-camera-id').value         = camera.id;
        document.getElementById('snapshot-camera-name').textContent = camera.name;
        document.getElementById('snapshot-stream-url').value        = camera.stream_url || '';
        document.getElementById('snapshot-file-input').value        = '';
        document.getElementById('snapshot-preview-wrapper').classList.add('hidden');
        document.getElementById('snapshot-error').classList.add('hidden');
        document.getElementById('btn-snapshot-upload').disabled = true;
        document.getElementById('capture-idle').classList.remove('hidden');
        document.getElementById('capture-loading').classList.add('hidden');
        document.getElementById('capture-preview-img').classList.add('hidden');
        document.getElementById('capture-error').classList.add('hidden');
        document.getElementById('btn-capture-use').disabled = true;
        activateTab('upload');
        document.getElementById('snapshot-modal').classList.remove('hidden');
    }

    function closeSnapshotModal() {
        stopCleanStream();
        document.getElementById('snapshot-modal').classList.add('hidden');
    }

    rebind('btn-snapshot-cancel', closeSnapshotModal);
    rebind('btn-capture-cancel',  closeSnapshotModal);
    document.getElementById('snapshot-modal').addEventListener('click', function(e) {
        if (e.target === this) closeSnapshotModal();
    });

    document.getElementById('snapshot-file-input').addEventListener('change', function() {
        const file   = this.files[0];
        const errDiv = document.getElementById('snapshot-error');
        const errTxt = document.getElementById('snapshot-error-text');
        errDiv.classList.add('hidden');
        if (!file) return;
        const allowed = ['image/jpeg','image/png','image/webp'];
        if (!allowed.includes(file.type)) {
            errTxt.textContent = 'Invalid file type. Please upload a JPEG, PNG or WEBP image.';
            errDiv.classList.remove('hidden'); return;
        }
        if (file.size > 10 * 1024 * 1024) {
            errTxt.textContent = 'File too large. Maximum size is 10MB.';
            errDiv.classList.remove('hidden'); return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('snapshot-preview').src = ev.target.result;
            document.getElementById('snapshot-file-name').textContent = file.name;
            document.getElementById('snapshot-preview-wrapper').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
        document.getElementById('btn-snapshot-upload').disabled = false;
    });

    rebind('btn-snapshot-upload', async () => {
        const camId = document.getElementById('snapshot-camera-id').value;
        const file  = document.getElementById('snapshot-file-input').files[0];
        if (!camId || !file) return;
        const btn = document.getElementById('btn-snapshot-upload');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';
        const form = new FormData();
        form.append('snapshot', file);
        try {
            const r = await fetch(URLS.uploadSnapshot(camId), {
                method: 'POST', headers: {'X-CSRFToken':CSRF}, body: form,
            });
            const d = await r.json();
            if (d.success) {
                camera.snapshot_url = d.snapshot_url;
                closeSnapshotModal();
                await loadSnapshotAsync(d.snapshot_url + '?v=' + Date.now());
                syncCanvasSize(); redraw();
                swal('Uploaded!', 'Snapshot updated successfully.', 'success');
            } else {
                document.getElementById('snapshot-error-text').textContent = d.error||'Upload failed.';
                document.getElementById('snapshot-error').classList.remove('hidden');
            }
        } catch {
            document.getElementById('snapshot-error-text').textContent = 'Server error. Please try again.';
            document.getElementById('snapshot-error').classList.remove('hidden');
        } finally {
            const b = document.getElementById('btn-snapshot-upload');
            if (b) { b.disabled=false; b.innerHTML='<i class="fa-solid fa-upload mr-1"></i> Upload'; }
        }
    });

    // Start/stop the live clean HLS stream inside the modal
    rebind('btn-capture-snap', async () => {
        const camId = document.getElementById('snapshot-camera-id').value;
        if (!camId) return;

        const video      = document.getElementById('capture-video');
        const btnSnap    = document.getElementById('btn-capture-snap');
        const btnUse     = document.getElementById('btn-capture-use');
        const idleEl     = document.getElementById('capture-idle');
        const loadingEl  = document.getElementById('capture-loading');
        const errorEl    = document.getElementById('capture-error');
        const errorTxt   = document.getElementById('capture-error-text');
        const previewImg = document.getElementById('capture-preview-img');

        // If already streaming, stop it
        if (!video.classList.contains('hidden')) {
            stopCleanStream();
            idleEl.classList.remove('hidden');
            previewImg.classList.add('hidden');
            btnUse.disabled = true;
            btnSnap.innerHTML = '<i class="fa-solid fa-play"></i> Start Live Preview';
            return;
        }

        idleEl.classList.add('hidden');
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        previewImg.classList.add('hidden');
        btnSnap.disabled = true;

        try {
            const r = await fetch(URLS.cleanStream(camId));
            const d = await r.json();
            loadingEl.classList.add('hidden');
            btnSnap.disabled = false;

            if (!d.success) {
                errorTxt.textContent = d.error || 'Stream unavailable.';
                errorEl.classList.remove('hidden');
                idleEl.classList.remove('hidden');
                return;
            }

            video.classList.remove('hidden');
            btnUse.disabled = false;
            btnSnap.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Preview';

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                _hlsInstance = new Hls({ lowLatencyMode: true });
                _hlsInstance.loadSource(d.stream_url);
                _hlsInstance.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS
                video.src = d.stream_url;
            } else {
                errorTxt.textContent = 'HLS not supported in this browser.';
                errorEl.classList.remove('hidden');
                video.classList.add('hidden');
                idleEl.classList.remove('hidden');
                btnUse.disabled = true;
            }
        } catch {
            loadingEl.classList.add('hidden');
            btnSnap.disabled = false;
            errorTxt.textContent = 'Server error. Please try again.';
            errorEl.classList.remove('hidden');
            idleEl.classList.remove('hidden');
        }
    });

    // Grab the current video frame via canvas and POST it as the new snapshot
    rebind('btn-capture-use', async () => {
        const video  = document.getElementById('capture-video');
        const canvas = document.getElementById('capture-canvas');
        if (!camera || video.classList.contains('hidden') || video.readyState < 2) return;

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        const btnUse    = document.getElementById('btn-capture-use');
        const errorEl   = document.getElementById('capture-error');
        const errorTxt  = document.getElementById('capture-error-text');
        btnUse.disabled = true;
        btnUse.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        errorEl.classList.add('hidden');

        canvas.toBlob(async (blob) => {
            const form = new FormData();
            form.append('snapshot', blob, `snapshot_camera_${camera.id}.jpg`);

            try {
                const r = await fetch(URLS.captureSnapshot(camera.id), {
                    method: 'POST', headers: { 'X-CSRFToken': CSRF }, body: form,
                });
                const d = await r.json();
                if (d.success) {
                    camera.snapshot_url = d.snapshot_url;
                    stopCleanStream();
                    closeSnapshotModal();
                    await loadSnapshotAsync(d.snapshot_url + '?v=' + Date.now());
                    syncCanvasSize(); redraw();
                    swal('Done!', 'Snapshot set successfully.', 'success');
                } else {
                    errorTxt.textContent = d.error || 'Failed to save snapshot.';
                    errorEl.classList.remove('hidden');
                }
            } catch {
                errorTxt.textContent = 'Server error. Please try again.';
                errorEl.classList.remove('hidden');
            } finally {
                const b = document.getElementById('btn-capture-use');
                if (b) { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-camera"></i> Capture & Use'; }
            }
        }, 'image/jpeg', 0.92);
    });

    function clone(obj)       { return JSON.parse(JSON.stringify(obj)); }
    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
    function esc(s)           { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    loadCamera();
}