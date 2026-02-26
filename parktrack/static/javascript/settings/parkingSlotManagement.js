export function initializeParkingSlotManagement() {

    if (!document.getElementById('js-config')) return;

    // Config
    const cfg  = document.getElementById('js-config').dataset;
    const URLS = {
        getSlots:       cfg.getSlotsUrl,
        bulkSave:       cfg.bulkSaveUrl,
        getCameras:     cfg.getCamerasUrl,
        addCamera:      cfg.addCameraUrl,
        editCamera:     (id) => cfg.editCameraUrlTemplate.replace('__ID__', id),
        deleteCamera:   (id) => cfg.deleteCameraUrlTemplate.replace('__ID__', id),
        uploadSnapshot: (id) => cfg.uploadSnapshotUrlTemplate.replace('__ID__', id),
    };
    const CSRF = cfg.csrfToken;

    // DOM Refs
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
    let _modalConfirmFn   = null;
    let _modalDiscardFn   = null;
    let _modalEnterFn     = null;
    let lastClickTime     = 0;
    let lastClickX        = 0;
    let lastClickY        = 0;
    const DBL_MS          = 300;
    const DBL_PX          = 10;

    // Listeners and Cleanup Rebinds
    // Resize
    if (window._psmResizeHandler) window.removeEventListener('resize', window._psmResizeHandler);
    window._psmResizeHandler = debounce(syncCanvasSize, 120);
    window.addEventListener('resize', window._psmResizeHandler);

    // Canvas — store handlers on element so next init can remove them
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

    // Buttons — cloneNode wipes old listeners cleanly
    function rebind(id, fn) {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true);
        el.replaceWith(fresh);
        fresh.addEventListener('click', fn);
    }
    rebind('start-edit',       enterEditingMode);
    rebind('btn-add',          () => switchMode('add'));
    rebind('btn-edit',         () => switchMode('edit'));
    rebind('btn-delete',       () => switchMode('delete'));
    rebind('btn-save',         saveChanges);
    rebind('btn-cancel',       cancelEditing);
    rebind('btn-upload-snapshot', () => openSnapshotModal(currentCameraId));
    rebind('btn-manage-cameras',  openCameraModal);

    // Camera select
    const oldSel   = document.getElementById('camera-select');
    const freshSel = oldSel.cloneNode(true);
    oldSel.replaceWith(freshSel);
    freshSel.addEventListener('change', onCameraChange);

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

    // Drawing
    const COLORS = {
        default:  { stroke: '#22c55e', fill: 'rgba(34,197,94,0.15)',  label: '#22c55e' },
        selected: { stroke: '#940B26', fill: 'rgba(148,11,38,0.20)',  label: '#940B26' },
        occupied: { stroke: '#f97316', fill: 'rgba(249,115,22,0.15)', label: '#f97316' },
        drawing:  { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.12)', label: '#3b82f6' },
    };
    const HR = 6; // handle radius

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

    // HIT Testing
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
    function closeLabelModal() { labelModal.classList.add('hidden'); }

    // Slot Footer
    function refreshFooter() {
        if (slots.length === 0) { slotsFooter.classList.add('hidden'); return; }
        slotsFooter.classList.remove('hidden');
        slotCount.textContent = slots.length;
        slotsTableBody.innerHTML = '';
        slots.forEach((slot, idx) => {
            const occ = slot.status === 'occupied';
            const tag = document.createElement('div');
            tag.className = ['flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors',
                occ ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-green-300 bg-green-50 text-green-700'].join(' ');
            tag.innerHTML = `<span class="w-2 h-2 rounded-full inline-block ${occ?'bg-orange-400':'bg-green-400'}"></span>
                ${esc(slot.slot_label)}${slot.id===null?'<span class="text-xs font-normal text-gray-400 ml-1">(new)</span>':''}`;
            tag.addEventListener('click', () => { if (currentMode==='edit') { selectedIndex=idx; redraw(); } });
            slotsTableBody.appendChild(tag);
        });
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

     async function onCameraChange() {
        const sel    = document.getElementById('camera-select');
        const option = sel.options[sel.selectedIndex];
        const camId  = sel.value;
        if (!camId) { resetEditor(); return; }
        if (currentMode !== 'view' && hasUnsavedChanges) {
            if (!(await confirmDiscard())) { sel.value = currentCameraId; return; }
        }
        currentCameraId = camId;
        showStatus('loading', 'Loading…');
        const [fetched] = await Promise.all([fetchSlots(camId), loadSnapshotAsync(option.dataset.snapshot||'')]);
        slots = fetched; originalSlots = clone(fetched); hasUnsavedChanges = false;
        exitEdit(); syncCanvasSize(); refreshFooter();
        showStatus('ready', option.dataset.name||'Camera ready');
        document.getElementById('start-edit').disabled = false;
        document.getElementById('btn-upload-snapshot').disabled = false;
        redraw();
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
            if (parkingSnapshot.complete && parkingSnapshot.naturalWidth > 0) {
                parkingSnapshot.onload = null; parkingSnapshot.onerror = null;
                syncCanvasSize(); resolve();
            }
        });
    }

    function resetEditor() {
        currentCameraId = null; slots = []; originalSlots = [];
        hasUnsavedChanges = false; selectedIndex = -1;
        isDrawingPolygon = false; currentPoints = [];
        emptyState.classList.remove('hidden');
        imageWrapper.classList.add('hidden');
        slotsFooter.classList.add('hidden');
        document.getElementById('camera-status').classList.add('hidden');
        document.getElementById('start-edit').disabled = true;
        document.getElementById('btn-upload-snapshot').disabled = true;
        exitEdit();
    }

    // Reload the camera dropdown from the API after any camera CRUD action
    async function refreshCameraSelect(selectValueToRestore) {
        try {
            const r = await fetch(URLS.getCameras);
            const d = await r.json();
            if (!d.success) return;
            const sel = document.getElementById('camera-select');
            const prev = selectValueToRestore ?? sel.value;
            sel.innerHTML = '<option value="">-- Choose a camera --</option>';
            d.cameras.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.dataset.snapshot = c.stream_url;
                opt.dataset.name     = c.name;
                opt.textContent      = c.name + (c.location ? ` — ${c.location}` : '');
                if (String(c.id) === String(prev)) opt.selected = true;
                sel.appendChild(opt);
            });
            // If the currently loaded camera was deleted, reset editor
            if (currentCameraId && !d.cameras.find(c => String(c.id) === String(currentCameraId))) {
                resetEditor();
            }
        } catch(e) { console.error('refreshCameraSelect failed', e); }
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
        if (!currentCameraId) return;
        const btn = document.getElementById('btn-save');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
        try {
            const result = await bulkSave(currentCameraId, slots);
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
        return Swal.fire({title:'Discard Changes?',text:'You have unsaved changes.',
            icon:'warning',showCancelButton:true,confirmButtonText:'Yes, Discard',
            cancelButtonText:'Keep Editing',confirmButtonColor:'#940B26',cancelButtonColor:'#6b7280'
        }).then(r => r.isConfirmed);
    }

    function swal(title, text, icon) {
        Swal.fire({title, text, icon, confirmButtonText:'OK', confirmButtonColor:'#940B26'});
    }

    // Unsaved Status
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
    function showStatus(state, text) {
        const cs = document.getElementById('camera-status');
        const dot = document.getElementById('status-dot');
        cs.classList.remove('hidden'); cs.classList.add('flex');
        document.getElementById('status-text').textContent = text;
        dot.className = `w-2 h-2 rounded-full inline-block ${{
            loading:'bg-yellow-400 animate-pulse', ready:'bg-green-500', error:'bg-red-500'
        }[state]||'bg-gray-400'}`;
    }

    function openCameraModal() {
        document.getElementById('camera-modal').classList.remove('hidden');
        loadCameraList();
    }
    function closeCameraModal() {
        document.getElementById('camera-modal').classList.add('hidden');
    }

    rebind('camera-modal-close', closeCameraModal);

    // Close on backdrop click
    document.getElementById('camera-modal').addEventListener('click', function(e) {
        if (e.target === this) closeCameraModal();
    });

    async function loadCameraList() {
        const list = document.getElementById('camera-list');
        list.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin text-2xl mb-2 block"></i>Loading…</div>';
        try {
            const r = await fetch(URLS.getCameras);
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            renderCameraList(d.cameras);
        } catch(e) {
            list.innerHTML = `<p class="text-center text-red-500 text-sm py-4">${esc(e.message||'Failed to load cameras.')}</p>`;
        }
    }

    function renderCameraList(cameras) {
        const list = document.getElementById('camera-list');
        if (cameras.length === 0) {
            list.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm"><i class="fa-solid fa-camera text-3xl mb-2 opacity-30 block"></i>No cameras added yet.</div>';
            return;
        }
        list.innerHTML = '';
        cameras.forEach(cam => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-white mb-2 hover:border-gray-300 transition-colors';
            const hasSnapshot = cam.stream_url && cam.stream_url.trim() !== '';
            card.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-camera text-gray-400 text-sm"></i>
                    </div>
                    <div class="min-w-0">
                        <p class="font-medium text-gray-800 text-sm truncate">${esc(cam.name)}</p>
                        <p class="text-xs text-gray-400 truncate">${cam.location ? esc(cam.location) : 'No location set'}</p>
                    </div>
                    ${hasSnapshot
                        ? '<span class="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">Snapshot set</span>'
                        : '<span class="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full shrink-0">No snapshot</span>'}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button class="cam-snapshot p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Upload Snapshot" data-id="${cam.id}" data-name="${esc(cam.name)}">
                        <i class="fa-solid fa-image text-sm"></i>
                    </button>
                    <button class="cam-edit p-2 text-gray-400 hover:text-[#940B26] hover:bg-red-50 rounded-lg transition-colors" title="Edit" data-id="${cam.id}" data-name="${esc(cam.name)}" data-location="${esc(cam.location||'')}">
                        <i class="fa-solid fa-pen text-sm"></i>
                    </button>
                    <button class="cam-delete p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete" data-id="${cam.id}" data-name="${esc(cam.name)}">
                        <i class="fa-solid fa-trash text-sm"></i>
                    </button>
                </div>`;

            card.querySelector('.cam-snapshot').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                openSnapshotModal(btn.dataset.id, btn.dataset.name);
            });
            card.querySelector('.cam-edit').addEventListener('click', (e) => {
                const btn = e.currentTarget;
                openEditCameraModal(btn.dataset.id, btn.dataset.name, btn.dataset.location);
            });
            card.querySelector('.cam-delete').addEventListener('click', (e) => {
                deleteCameraById(e.currentTarget.dataset.id, e.currentTarget.dataset.name);
            });

            list.appendChild(card);
        });
    }

    rebind('btn-add-camera', async () => {
        const name     = document.getElementById('new-camera-name').value.trim();
        const location = document.getElementById('new-camera-location').value.trim();
        const errDiv   = document.getElementById('add-camera-error');
        const errTxt   = document.getElementById('add-camera-error-text');
        errDiv.classList.add('hidden');

        if (!name) { errTxt.textContent = 'Camera name is required.'; errDiv.classList.remove('hidden'); return; }

        const btn = document.getElementById('btn-add-camera');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding…';

        try {
            const r = await fetch(URLS.addCamera, {
                method: 'POST',
                headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
                body: JSON.stringify({name, location}),
            });
            const d = await r.json();
            if (d.success) {
                document.getElementById('new-camera-name').value = '';
                document.getElementById('new-camera-location').value = '';
                await loadCameraList();
                await refreshCameraSelect();
            } else {
                errTxt.textContent = d.error||'Failed to add camera.';
                errDiv.classList.remove('hidden');
            }
        } catch { errTxt.textContent = 'Server error. Please try again.'; errDiv.classList.remove('hidden'); }
        finally {
            const b = document.getElementById('btn-add-camera');
            if (b) { b.disabled=false; b.innerHTML='<i class="fa-solid fa-plus"></i> Add Camera'; }
        }
    });

    function openEditCameraModal(id, name, location) {
        document.getElementById('edit-camera-id').value       = id;
        document.getElementById('edit-camera-name').value     = name;
        document.getElementById('edit-camera-location').value = location;
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
        const id       = document.getElementById('edit-camera-id').value;
        const name     = document.getElementById('edit-camera-name').value.trim();
        const location = document.getElementById('edit-camera-location').value.trim();
        const errDiv   = document.getElementById('edit-camera-error');
        const errTxt   = document.getElementById('edit-camera-error-text');
        errDiv.classList.add('hidden');

        if (!name) { errTxt.textContent = 'Camera name is required.'; errDiv.classList.remove('hidden'); return; }

        const btn = document.getElementById('btn-edit-camera-save');
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

        try {
            const r = await fetch(URLS.editCamera(id), {
                method: 'POST',
                headers: {'Content-Type':'application/json','X-CSRFToken':CSRF},
                body: JSON.stringify({name, location}),
            });
            const d = await r.json();
            if (d.success) {
                closeEditCameraModal();
                await loadCameraList();
                await refreshCameraSelect(currentCameraId);
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

    async function deleteCameraById(id, name) {
        const confirmed = await Swal.fire({
            title: `Delete "${name}"?`,
            text: 'This will also delete all parking slots for this camera. This cannot be undone.',
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'Yes, Delete', cancelButtonText: 'Cancel',
            confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
        }).then(r => r.isConfirmed);
        if (!confirmed) return;

        try {
            const r = await fetch(URLS.deleteCamera(id), {
                method: 'POST', headers: {'X-CSRFToken':CSRF}
            });
            const d = await r.json();
            if (d.success) {
                await loadCameraList();
                await refreshCameraSelect(currentCameraId);
            } else {
                swal('Error', d.error||'Failed to delete camera.', 'error');
            }
        } catch { swal('Error', 'Server error. Please try again.', 'error'); }
    }

    function openSnapshotModal(cameraId, cameraName) {
        // cameraId may be null if called from toolbar with no name supplied
        const name = cameraName || document.getElementById('camera-select')
            ?.options[document.getElementById('camera-select')?.selectedIndex]?.dataset?.name || 'this camera';

        document.getElementById('snapshot-camera-id').value  = cameraId || currentCameraId;
        document.getElementById('snapshot-camera-name').textContent = name;
        document.getElementById('snapshot-file-input').value = '';
        document.getElementById('snapshot-preview-wrapper').classList.add('hidden');
        document.getElementById('snapshot-error').classList.add('hidden');
        document.getElementById('btn-snapshot-upload').disabled = true;
        document.getElementById('snapshot-modal').classList.remove('hidden');
    }
    function closeSnapshotModal() {
        document.getElementById('snapshot-modal').classList.add('hidden');
    }

    rebind('btn-snapshot-cancel', closeSnapshotModal);
    document.getElementById('snapshot-modal').addEventListener('click', function(e) {
        if (e.target === this) closeSnapshotModal();
    });

    // File input preview
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

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('snapshot-preview').src = e.target.result;
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
                closeSnapshotModal();
                await refreshCameraSelect(currentCameraId);
                // If the uploaded snapshot is for the currently-loaded camera,
                // reload the snapshot on the canvas immediately
                if (String(camId) === String(currentCameraId)) {
                    await loadSnapshotAsync(d.snapshot_url);
                    syncCanvasSize(); redraw();
                }
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

    // Utilities

    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    requestAnimationFrame(() => {
        resetEditor();
        const sel = document.getElementById('camera-select');
        if (sel && sel.value) onCameraChange.call(sel);
    });
}