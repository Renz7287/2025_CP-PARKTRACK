/**
 * reservation.js
 * Parking slot reservation tab — user slot picker, form, and admin table + map.
 * Follows the same export/initialize pattern as other tabs (parkingAllotment, etc.)
 * Config is read inside initializeReservation() so AJAX reloads always get fresh values.
 */

// Module-level state (reset on each initialize call)
let allSlots        = [];
let selectedSlotId  = null;
let countdownTimer  = null;
let resizeObserver  = null;

// Read config fresh each call — never at module-load time
function cfg() {
    return {
        api:      window.PARK_TRACK?.urls      ?? {},
        isAdmin:  window.PARK_TRACK?.isAdmin   ?? false,
        csrf:     window.PARK_TRACK?.csrfToken ?? '',
        cameraId: window.PARK_TRACK?.cameraId  ?? null,
    };
}

export function initializeReservation() {
    if (!document.querySelector('.reservations-section')) return;
    teardown();
    cfg().isAdmin ? initAdmin() : initUser();
}

function teardown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (resizeObserver) { resizeObserver.disconnect();   resizeObserver  = null; }
    allSlots       = [];
    selectedSlotId = null;
}

// ─── USER VIEW ────────────────────────────────────────────────────────────────

async function initUser() {
    bindFormEvents();
    // Load slots first so drawOverlay() has data when snapshot image fires onload
    await loadSlots();
    // loadSnapshot is NOT awaited — runs in background, calls drawOverlay() from img.onload
    loadSnapshot();
    loadMyReservations();
    setInterval(loadSlots, 30_000);
    countdownTimer = setInterval(tickCountdowns, 1_000);
}

async function loadSnapshot() {
    const { api, cameraId } = cfg();
    const img  = document.getElementById('res-parking-snapshot');
    const skel = document.getElementById('snapshot-skeleton');
    const err  = document.getElementById('snapshot-error');
    if (!img) return;

    if (!api.snapshot) {
        skel?.classList.add('hidden');
        err?.classList.remove('hidden');
        return;
    }

    err?.classList.add('hidden');
    img.classList.add('hidden');
    skel?.classList.remove('hidden');

    try {
        const url = new URL(api.snapshot, location.origin);
        if (cameraId) url.searchParams.set('camera_id', cameraId);
        url.searchParams.set('t', Date.now());

        const res  = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();

        if (!data.url) {
            skel?.classList.add('hidden');
            err?.classList.remove('hidden');
            return;
        }

        return new Promise(resolve => {
            img.onload = () => {
                skel?.classList.add('hidden');
                err?.classList.add('hidden');
                img.classList.remove('hidden');
                if (allSlots.length) drawOverlay();
                resolve();
            };
            img.onerror = () => {
                skel?.classList.add('hidden');
                err?.classList.remove('hidden');
                img.classList.add('hidden');
                resolve();
            };
            img.src = data.url.startsWith('http') ? data.url : location.origin + data.url;
        });

    } catch (e) {
        skel?.classList.add('hidden');
        err?.classList.remove('hidden');
        img.classList.add('hidden');
        console.error('loadSnapshot error:', e);
    }
}

async function loadSlots() {
    const { api, cameraId } = cfg();
    if (!api.slots) return;
    try {
        const url = new URL(api.slots, location.origin);
        if (cameraId) url.searchParams.set('camera_id', cameraId);

        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(res.status);

        allSlots = (await res.json()).slots ?? [];
        document.getElementById('no-slots-warning')?.classList.toggle('hidden', allSlots.length > 0);
        drawOverlay();
        drawGrid();
        validateForm();
    } catch (e) {
        console.error('loadSlots:', e);
    }
}

/**
 * SVG polygon overlay drawn over the parking snapshot.
 * Coords are normalized 0-1 — multiply by the RENDERED image dimensions.
 *
 * With object-contain, the image fits inside the container with possible
 * letterbox bars. We calculate the actual rendered image rect and position
 * the SVG to match it exactly, so polygons align with the visible image.
 */
function drawOverlay() {
    const container = document.getElementById('slot-overlay-container');
    const img       = document.getElementById('res-parking-snapshot');
    if (!container || !img) return;

    if (img.classList.contains('hidden') || !img.clientWidth || !img.clientHeight) {
        if (img.complete && img.naturalWidth) requestAnimationFrame(drawOverlay);
        return;
    }

    // Calculate the actual rendered image size inside the object-contain box
    const containerW = img.clientWidth;
    const containerH = img.clientHeight;
    const natW       = img.naturalWidth  || containerW;
    const natH       = img.naturalHeight || containerH;
    const scale      = Math.min(containerW / natW, containerH / natH);
    const rw         = natW * scale;   // actual rendered image width
    const rh         = natH * scale;   // actual rendered image height
    // Letterbox offsets (centering)
    const ox         = (containerW - rw) / 2;
    const oy         = (containerH - rh) / 2;

    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width',  '100%');
    svg.setAttribute('height', '100%');
    // SVG non-interactive by default; individual polygons opt-in via style.pointerEvents
    svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';

    const palette = {
        available: { fill: 'rgba(74,222,128,0.25)',  stroke: '#16a34a', hover: 'rgba(74,222,128,0.50)' },
        occupied:  { fill: 'rgba(239,68,68,0.30)',   stroke: '#b91c1c', hover: 'rgba(239,68,68,0.30)'  },
        reserved:  { fill: 'rgba(250,204,21,0.30)',  stroke: '#b45309', hover: 'rgba(250,204,21,0.30)' },
        disabled:  { fill: 'rgba(156,163,175,0.30)', stroke: '#6b7280', hover: 'rgba(156,163,175,0.30)'},
    };

    let hasPolygons = false;

    allSlots.forEach(slot => {
        const pts = slot.polygon_points;
        if (!Array.isArray(pts) || pts.length < 3) return;
        hasPolygons = true;

        const c   = palette[slot.status] ?? palette.disabled;
        const sel = slot.id === selectedSlotId;

        // Coords are normalized 0-1, scale to rendered image size then offset
        // by letterbox margins (ox, oy) so polygons land on the actual image area
        const ptStr = pts.map(function(p) {
            return (ox + p[0] * rw).toFixed(1) + ',' + (oy + p[1] * rh).toFixed(1);
        }).join(' ');

        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points',       ptStr);
        poly.setAttribute('fill',         sel ? 'rgba(124,209,249,0.45)' : c.fill);
        poly.setAttribute('stroke',       sel ? '#0ea5e9' : c.stroke);
        poly.setAttribute('stroke-width', sel ? '3' : '2');
        poly.style.cursor        = slot.is_reservable ? 'pointer' : 'default';
        poly.style.pointerEvents = slot.is_reservable ? 'auto' : 'none';
        poly.style.transition    = 'fill 0.15s';

        if (slot.is_reservable) {
            (function(s, p, c) {
                p.addEventListener('mouseenter', function() { if (s.id !== selectedSlotId) p.setAttribute('fill', c.hover); });
                p.addEventListener('mouseleave', function() { if (s.id !== selectedSlotId) p.setAttribute('fill', c.fill); });
                p.addEventListener('click', function() { selectSlot(s); });
            })(slot, poly, c);
        }

        const tip = document.createElementNS(NS, 'title');
        tip.textContent = 'Slot ' + slot.slot_label + ' - ' + slot.status;
        poly.appendChild(tip);

        let sumX = 0, sumY = 0;
        pts.forEach(function(p) { sumX += ox + p[0] * rw; sumY += oy + p[1] * rh; });
        const cx = (sumX / pts.length).toFixed(1);
        const cy = (sumY / pts.length).toFixed(1);

        const lbl = document.createElementNS(NS, 'text');
        lbl.setAttribute('x', cx);
        lbl.setAttribute('y', cy);
        lbl.setAttribute('text-anchor',       'middle');
        lbl.setAttribute('dominant-baseline', 'middle');
        lbl.setAttribute('fill',              sel ? '#0c4a6e' : '#fff');
        lbl.setAttribute('font-size',         '11');
        lbl.setAttribute('font-weight',       'bold');
        lbl.setAttribute('stroke',            'rgba(0,0,0,0.6)');
        lbl.setAttribute('stroke-width',      '3');
        lbl.setAttribute('paint-order',       'stroke fill');
        lbl.setAttribute('pointer-events',    'none');
        lbl.textContent = slot.slot_label;

        svg.appendChild(poly);
        svg.appendChild(lbl);
    });

    container.innerHTML = '';
    container.appendChild(svg);
    container.style.pointerEvents = hasPolygons ? 'auto' : 'none';

    if (!resizeObserver) {
        resizeObserver = new ResizeObserver(function() { if (allSlots.length) drawOverlay(); });
        resizeObserver.observe(img);
    }
}

function drawGrid() {
    const grid = document.getElementById('slot-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const colors = {
        available: 'bg-green-100 border-green-400 text-green-800 hover:bg-green-200 cursor-pointer',
        occupied:  'bg-red-100 border-red-300 text-red-700 cursor-not-allowed opacity-70',
        reserved:  'bg-yellow-100 border-yellow-300 text-yellow-800 cursor-not-allowed opacity-70',
        disabled:  'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed opacity-60',
    };

    allSlots.forEach(slot => {
        const ring = slot.id === selectedSlotId ? 'ring-2 ring-[#7cd1f9] ring-offset-1 scale-105' : '';
        const btn  = document.createElement('button');
        btn.type      = 'button';
        btn.disabled  = !slot.is_reservable;
        btn.className = 'flex flex-col items-center justify-center h-14 rounded-xl border-2 font-bold text-sm transition-all duration-150 ' + (colors[slot.status] ?? colors.disabled) + ' ' + ring;
        btn.title     = 'Slot ' + slot.slot_label + ' (' + slot.status + ')';
        btn.innerHTML = '<span class="text-base leading-none">' + slot.slot_label + '</span><span class="text-[10px] font-normal mt-0.5 capitalize">' + slot.status + '</span>';
        if (slot.is_reservable) btn.addEventListener('click', (function(s) { return function() { selectSlot(s); }; })(slot));
        grid.appendChild(btn);
    });
}

function selectSlot(slot) {
    selectedSlotId = slot.id;
    document.getElementById('selected-slot-badge')?.classList.remove('hidden');
    const lbl = document.getElementById('selected-slot-label');
    if (lbl) lbl.textContent = slot.slot_label;
    const info = document.getElementById('selected-slot-info');
    if (info) info.textContent = 'Slot ' + slot.slot_label + ' selected — fill in your details and click Reserve.';
    const hidden = document.getElementById('selected-slot-id');
    if (hidden) hidden.value = slot.id;
    drawOverlay(); drawGrid(); validateForm();
    document.getElementById('reservation-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearSelection() {
    selectedSlotId = null;
    document.getElementById('selected-slot-badge')?.classList.add('hidden');
    const info = document.getElementById('selected-slot-info');
    if (info) info.textContent = 'No slot selected yet. Click a green slot above.';
    const hidden = document.getElementById('selected-slot-id');
    if (hidden) hidden.value = '';
    drawOverlay(); drawGrid(); validateForm();
}

function validateForm() {
    const btn = document.getElementById('submit-reservation-btn');
    if (!btn) return;
    const ready = !!(selectedSlotId &&
                     document.getElementById('res-plate-number')?.value &&
                     document.getElementById('res-arrival-time')?.value);
    btn.disabled  = !ready;
    btn.className = ready
        ? 'w-full py-3 rounded-xl font-semibold text-white bg-green-500 hover:bg-green-600 cursor-pointer transition-all duration-200'
        : 'w-full py-3 rounded-xl font-semibold text-white bg-gray-300 cursor-not-allowed transition-all duration-200';
}

function bindFormEvents() {
    document.getElementById('res-plate-number')?.addEventListener('change', validateForm);
    document.getElementById('res-arrival-time')?.addEventListener('input',  validateForm);
    document.getElementById('clear-slot-selection')?.addEventListener('click', clearSelection);
    document.getElementById('refresh-my-reservations')?.addEventListener('click', loadMyReservations);
    document.getElementById('retry-snapshot')?.addEventListener('click', async function() {
        document.getElementById('snapshot-error')?.classList.add('hidden');
        document.getElementById('snapshot-skeleton')?.classList.remove('hidden');
        await loadSnapshot();
        if (allSlots.length) drawOverlay();
    });

    const timeInput = document.getElementById('res-arrival-time');
    if (timeInput) {
        const now = new Date();
        timeInput.min = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    }

    document.getElementById('submit-reservation-btn')?.addEventListener('click', showConfirmModal);
    document.getElementById('modal-cancel-btn')?.addEventListener('click', hideConfirmModal);
    document.getElementById('modal-confirm-btn')?.addEventListener('click', submitReservation);
    document.getElementById('res-confirm-modal')?.addEventListener('click', function(e) {
        if (e.target.id === 'res-confirm-modal') hideConfirmModal();
    });
}

function showConfirmModal() {
    const plate = document.getElementById('res-plate-number')?.value;
    const time  = document.getElementById('res-arrival-time')?.value;
    const slot  = allSlots.find(s => s.id === selectedSlotId);
    if (!plate || !time || !slot) return;

    const parts   = time.split(':').map(Number);
    const arrival = new Date(); arrival.setHours(parts[0], parts[1], 0, 0);
    const expiry  = new Date(arrival.getTime() + 5 * 60000);

    document.getElementById('modal-slot').textContent   = slot.slot_label;
    document.getElementById('modal-plate').textContent  = plate.toUpperCase();
    document.getElementById('modal-time').textContent   = time;
    document.getElementById('modal-expiry').textContent = expiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const modal = document.getElementById('res-confirm-modal');
    modal?.classList.remove('hidden');
    modal?.classList.add('flex');
}

function hideConfirmModal() {
    const modal = document.getElementById('res-confirm-modal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
}

async function submitReservation() {
    const { api, csrf } = cfg();
    const plate = document.getElementById('res-plate-number')?.value;
    const time  = document.getElementById('res-arrival-time')?.value;
    hideConfirmModal();

    const btn = document.getElementById('submit-reservation-btn');
    if (btn) {
        btn.disabled  = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Reserving...';
        btn.className = 'w-full py-3 rounded-xl font-semibold text-white bg-green-400 cursor-not-allowed transition-all duration-200';
    }

    try {
        const res  = await fetch(api.create, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
            body: JSON.stringify({ slot_id: selectedSlotId, plate_number: plate, arrival_time: time }),
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error ?? 'Failed to create reservation.'); return; }

        showSuccess('Reservation Confirmed!',
            'Slot <strong>' + data.reservation.slot_label + '</strong> reserved. Expires at <strong>' + fmtTime(data.reservation.expiry_time) + '</strong>.');
        clearSelection();
        document.getElementById('res-plate-number').value = '';
        document.getElementById('res-arrival-time').value  = '';
        await Promise.all([loadSlots(), loadMyReservations()]);
    } catch (e) {
        showError('Network error. Please try again.');
        console.error('submitReservation:', e);
    } finally {
        if (btn) btn.innerHTML = '<i class="fa-solid fa-calendar-check mr-2"></i>Reserve Slot';
        validateForm();
    }
}

async function loadMyReservations() {
    const { api } = cfg();
    try {
        const res  = await fetch(api.myReservations, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(res.status);
        renderMyReservations((await res.json()).reservations ?? []);
    } catch (e) {
        console.error('loadMyReservations:', e);
    }
}

function renderMyReservations(list) {
    const el = document.getElementById('my-reservations-container');
    if (!el) return;

    if (!list.length) {
        el.innerHTML = '<p class="text-gray-400 text-sm text-center py-6"><i class="fa-solid fa-calendar-times text-3xl block mb-2"></i>You have no active reservations.</p>';
        return;
    }

    el.innerHTML = list.map(r =>
        '<div class="border border-gray-200 rounded-xl p-4 mb-3 bg-gray-50 hover:bg-white transition-colors">' +
        '<div class="flex items-start justify-between mb-2"><div>' +
        '<div class="flex items-center gap-2"><span class="text-lg font-bold text-gray-800">' + esc(r.slot_label) + '</span>' +
        '<span class="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span></div>' +
        '<p class="text-sm text-gray-500 mt-0.5"><i class="fa-solid fa-car-side mr-1"></i>' + esc(r.plate_number) + '</p>' +
        '<p class="text-xs text-gray-400 mt-0.5"><i class="fa-solid fa-clock mr-1"></i>Arrival: ' + fmtTime(r.arrival_time) + '</p></div>' +
        '<button class="js-cancel-res text-red-400 hover:text-red-600 transition-colors p-1" data-id="' + r.id + '">' +
        '<i class="fa-solid fa-times-circle text-xl"></i></button></div>' +
        '<div class="flex items-center justify-between text-xs border-t border-gray-200 pt-2 mt-2">' +
        '<span class="text-gray-400">Expires in:</span>' +
        '<span class="js-countdown font-bold text-gray-700" data-expiry="' + new Date(r.expiry_time).getTime() + '">' +
        countdown(new Date(r.expiry_time).getTime()) + '</span></div></div>'
    ).join('');

    el.querySelectorAll('.js-cancel-res').forEach(function(btn) {
        btn.addEventListener('click', function() { cancelReservation(btn.dataset.id); });
    });
}

async function cancelReservation(id) {
    const { api, csrf } = cfg();
    if (!await confirm2('Cancel Reservation?', 'Are you sure you want to cancel?')) return;
    try {
        const res  = await fetch(api.cancelBase + id + api.cancelSuffix, {
            method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': csrf },
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error ?? 'Failed to cancel.'); return; }
        showSuccess('Cancelled', 'Reservation has been cancelled.');
        await Promise.all([loadSlots(), loadMyReservations()]);
    } catch (e) {
        showError('Network error.');
        console.error('cancelReservation:', e);
    }
}

function tickCountdowns() {
    let needsRefresh = false;
    document.querySelectorAll('.js-countdown').forEach(function(el) {
        const text = countdown(parseInt(el.dataset.expiry));
        el.textContent = text;
        el.className = 'js-countdown font-bold ' + (parseInt(el.dataset.expiry) - Date.now() < 60000 ? 'text-red-500' : 'text-gray-700');
        if (text === 'Expired') needsRefresh = true;
    });
    if (needsRefresh) { loadMyReservations(); loadSlots(); }
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────

async function initAdmin() {
    // loadAdminSnapshot is NOT awaited — races alongside slots, calls drawAdminOverlay from onload
    loadAdminSnapshot();
    await loadAdminSlots();
    await loadAdminData();

    document.getElementById('admin-search')?.addEventListener('input', debounce(loadAdminData, 300));
    document.getElementById('admin-filter-status')?.addEventListener('change', loadAdminData);
    document.getElementById('admin-refresh-btn')?.addEventListener('click', function() {
        loadAdminSlots();
        loadAdminData();
    });
}

/**
 * Admin snapshot — identical fetch pattern to user loadSnapshot().
 * Endpoint returns JSON {url:'...'}, sets img.src, calls drawAdminOverlay from onload.
 */
async function loadAdminSnapshot() {
    const { api, cameraId } = cfg();
    const img  = document.getElementById('admin-parking-snapshot');
    const skel = document.getElementById('admin-snapshot-skeleton');
    const err  = document.getElementById('admin-snapshot-error');
    if (!img) return;

    if (!api.snapshot) {
        skel?.classList.add('hidden');
        err?.classList.remove('hidden');
        return;
    }

    err?.classList.add('hidden');
    img.classList.add('hidden');
    skel?.classList.remove('hidden');

    try {
        const url = new URL(api.snapshot, location.origin);
        if (cameraId) url.searchParams.set('camera_id', cameraId);
        url.searchParams.set('t', Date.now());

        const res  = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();

        if (!data.url) {
            skel?.classList.add('hidden');
            err?.classList.remove('hidden');
            return;
        }

        return new Promise(function(resolve) {
            img.onload = function() {
                skel?.classList.add('hidden');
                err?.classList.add('hidden');
                img.classList.remove('hidden');
                if (allSlots.length) drawAdminOverlay();
                resolve();
            };
            img.onerror = function() {
                skel?.classList.add('hidden');
                err?.classList.remove('hidden');
                img.classList.add('hidden');
                resolve();
            };
            img.src = data.url.startsWith('http') ? data.url : location.origin + data.url;
        });

    } catch (e) {
        skel?.classList.add('hidden');
        err?.classList.remove('hidden');
        img.classList.add('hidden');
        console.error('loadAdminSnapshot error:', e);
    }
}

async function loadAdminSlots() {
    const { api, cameraId } = cfg();
    if (!api.slots) return;
    try {
        const url = new URL(api.slots, location.origin);
        if (cameraId) url.searchParams.set('camera_id', cameraId);
        url.searchParams.set('include_disabled', '1');

        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(res.status);
        allSlots = (await res.json()).slots ?? [];
        drawAdminOverlay();
        renderAdminSlotGrid();
    } catch (e) {
        console.error('loadAdminSlots:', e);
    }
}

/**
 * Admin polygon overlay — same coord system as drawOverlay() (normalized 0-1).
 * All polygons are clickable for enable/disable action.
 * Uses object-contain letterbox correction (ox, oy) same as user drawOverlay().
 */
function drawAdminOverlay() {
    const container = document.getElementById('admin-slot-overlay-container');
    const img       = document.getElementById('admin-parking-snapshot');
    if (!container || !img) return;

    if (img.classList.contains('hidden') || !img.clientWidth || !img.clientHeight) {
        if (img.complete && img.naturalWidth) requestAnimationFrame(drawAdminOverlay);
        return;
    }

    const containerW = img.clientWidth;
    const containerH = img.clientHeight;
    const natW       = img.naturalWidth  || containerW;
    const natH       = img.naturalHeight || containerH;
    const scale      = Math.min(containerW / natW, containerH / natH);
    const rw         = natW * scale;
    const rh         = natH * scale;
    const ox         = (containerW - rw) / 2;
    const oy         = (containerH - rh) / 2;

    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width',  '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';

    const palette = {
        available: { fill: 'rgba(74,222,128,0.25)',  stroke: '#16a34a', hover: 'rgba(74,222,128,0.50)' },
        occupied:  { fill: 'rgba(239,68,68,0.30)',   stroke: '#b91c1c', hover: 'rgba(239,68,68,0.50)'  },
        reserved:  { fill: 'rgba(250,204,21,0.30)',  stroke: '#b45309', hover: 'rgba(250,204,21,0.50)' },
        disabled:  { fill: 'rgba(156,163,175,0.30)', stroke: '#6b7280', hover: 'rgba(156,163,175,0.50)'},
    };

    allSlots.forEach(function(slot) {
        const pts = slot.polygon_points;
        if (!Array.isArray(pts) || pts.length < 3) return;

        const c     = palette[slot.status] ?? palette.disabled;
        const ptStr = pts.map(function(p) {
            return (ox + p[0] * rw).toFixed(1) + ',' + (oy + p[1] * rh).toFixed(1);
        }).join(' ');

        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points',       ptStr);
        poly.setAttribute('fill',         c.fill);
        poly.setAttribute('stroke',       c.stroke);
        poly.setAttribute('stroke-width', '2');
        poly.style.cursor        = 'pointer';
        poly.style.pointerEvents = 'auto';
        poly.style.transition    = 'fill 0.15s';

        (function(s, p, c) {
            p.addEventListener('mouseenter', function() { p.setAttribute('fill', c.hover); });
            p.addEventListener('mouseleave', function() { p.setAttribute('fill', c.fill); });
            p.addEventListener('click',      function() { showAdminSlotMenu(s); });
        })(slot, poly, c);

        const tip = document.createElementNS(NS, 'title');
        tip.textContent = 'Slot ' + slot.slot_label + ' - ' + slot.status;
        poly.appendChild(tip);

        let sumX = 0, sumY = 0;
        pts.forEach(function(p) { sumX += ox + p[0] * rw; sumY += oy + p[1] * rh; });
        const cx = (sumX / pts.length).toFixed(1);
        const cy = (sumY / pts.length).toFixed(1);

        const lbl = document.createElementNS(NS, 'text');
        lbl.setAttribute('x', cx);
        lbl.setAttribute('y', cy);
        lbl.setAttribute('text-anchor',       'middle');
        lbl.setAttribute('dominant-baseline', 'middle');
        lbl.setAttribute('fill',              '#fff');
        lbl.setAttribute('font-size',         '11');
        lbl.setAttribute('font-weight',       'bold');
        lbl.setAttribute('stroke',            'rgba(0,0,0,0.6)');
        lbl.setAttribute('stroke-width',      '3');
        lbl.setAttribute('paint-order',       'stroke fill');
        lbl.setAttribute('pointer-events',    'none');
        lbl.textContent = slot.slot_label;

        svg.appendChild(poly);
        svg.appendChild(lbl);
    });

    container.innerHTML = '';
    container.appendChild(svg);
    container.style.pointerEvents = 'auto';

    if (!resizeObserver) {
        resizeObserver = new ResizeObserver(function() { if (allSlots.length) drawAdminOverlay(); });
        resizeObserver.observe(img);
    }
}

function showAdminSlotMenu(slot) {
    document.getElementById('admin-slot-menu')?.remove();

    const isDisabled = slot.status === 'disabled';
    const menu = document.createElement('div');
    menu.id = 'admin-slot-menu';
    menu.className = 'fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-56';
    const statusColor = slot.status === 'available' ? 'bg-green-100 text-green-700' :
                        slot.status === 'occupied'  ? 'bg-red-100 text-red-700' :
                        slot.status === 'reserved'  ? 'bg-yellow-100 text-yellow-700' :
                                                      'bg-gray-100 text-gray-600';
    menu.innerHTML =
        '<div class="flex items-center justify-between mb-3">' +
        '<span class="font-bold text-gray-800">Slot ' + esc(slot.slot_label) + '</span>' +
        '<span class="text-xs px-2 py-0.5 rounded-full font-semibold ' + statusColor + '">' + cap(slot.status) + '</span></div>' +
        '<button id="admin-toggle-slot-btn" class="w-full py-2 rounded-lg text-sm font-semibold transition-colors ' +
        (isDisabled ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700') + '">' +
        '<i class="fa-solid ' + (isDisabled ? 'fa-toggle-on' : 'fa-toggle-off') + ' mr-2"></i>' +
        (isDisabled ? 'Enable Slot' : 'Disable Slot') + '</button>' +
        '<button id="admin-close-slot-menu" class="mt-2 w-full py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>';

    menu.style.top       = '50%';
    menu.style.left      = '50%';
    menu.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(menu);

    menu.querySelector('#admin-toggle-slot-btn').addEventListener('click', async function() {
        menu.remove();
        await toggleSlotDisabled(slot);
    });
    menu.querySelector('#admin-close-slot-menu').addEventListener('click', function() { menu.remove(); });

    setTimeout(function() {
        document.addEventListener('click', function handler(e) {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', handler); }
        });
    }, 50);
}

async function toggleSlotDisabled(slot) {
    const { api, csrf } = cfg();
    const action = slot.status === 'disabled' ? 'enable' : 'disable';

    if (!await confirm2(cap(action) + ' Slot?', 'Are you sure you want to ' + action + ' slot ' + slot.slot_label + '?')) return;

    try {
        const res  = await fetch(api.adminSlotToggle ?? '/reservation/admin/slot/toggle/', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
            body: JSON.stringify({ slot_id: slot.id, action: action }),
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error ?? 'Failed to update slot.'); return; }
        showSuccess('Updated', 'Slot ' + slot.slot_label + ' has been ' + action + 'd.');
        await Promise.all([loadAdminSlots(), loadAdminData()]);
    } catch (e) {
        showError('Network error.'); console.error('toggleSlotDisabled:', e);
    }
}

async function loadAdminData() {
    const { api } = cfg();
    const search = document.getElementById('admin-search')?.value  ?? '';
    const status = document.getElementById('admin-filter-status')?.value ?? 'all';
    const url    = new URL(api.adminAll, location.origin);
    if (search) url.searchParams.set('search', search);
    if (status !== 'all') url.searchParams.set('status', status);

    try {
        const res  = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        renderAdminTable(data.reservations ?? []);
        renderAdminStats(data.summary ?? {});
    } catch (e) {
        console.error('loadAdminData:', e);
    }
}

function renderAdminTable(list) {
    const tbody = document.getElementById('admin-reservations-body');
    const empty = document.getElementById('admin-empty-state');
    if (!tbody) return;

    if (!list.length) { tbody.innerHTML = ''; empty?.classList.remove('hidden'); return; }
    empty?.classList.add('hidden');

    const badge = {
        active:    'bg-green-100 text-green-800',
        expired:   'bg-gray-100  text-gray-600',
        cancelled: 'bg-red-100   text-red-700',
        fulfilled: 'bg-blue-100  text-blue-800',
    };

    tbody.innerHTML = list.map(function(r) {
        const can = r.status === 'active';
        const badgeClass = badge[r.status] ?? 'bg-gray-100 text-gray-600';
        const btnClass = can ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60';
        return '<tr class="hover:bg-gray-50 transition-colors">' +
            '<td class="py-3 px-4">' + esc(r.user_name) + '</td>' +
            '<td class="py-3 px-4 font-mono font-semibold">' + esc(r.plate_number) + '</td>' +
            '<td class="py-3 px-4 font-bold">' + esc(r.slot_label) + '</td>' +
            '<td class="py-3 px-4 text-sm text-gray-600">' + fmtDatetime(r.arrival_time) + '</td>' +
            '<td class="py-3 px-4 text-sm text-gray-600">' + fmtDatetime(r.expiry_time) + '</td>' +
            '<td class="py-3 px-4"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ' + badgeClass + '">' + cap(r.status) + '</span></td>' +
            '<td class="py-3 px-4"><button class="js-admin-cancel flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg ' + btnClass + '" data-id="' + r.id + '"' + (!can ? ' disabled' : '') + '>' +
            '<i class="fa-solid fa-ban"></i> Cancel</button></td></tr>';
    }).join('');

    tbody.querySelectorAll('.js-admin-cancel:not([disabled])').forEach(function(btn) {
        btn.addEventListener('click', function() { adminCancel(btn.dataset.id); });
    });
}

function renderAdminStats(obj) {
    const s = obj || {};
    const set = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v ?? '0'; };
    set('admin-total-count',   s.total);
    set('admin-active-count',  s.active);
    set('admin-expired-count', s.expired);
}

async function adminCancel(id) {
    const { api, csrf } = cfg();
    if (!await confirm2('Cancel Reservation?', 'This will free the slot and cannot be undone.')) return;
    try {
        const res  = await fetch(api.cancelBase + id + api.cancelSuffix, {
            method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': csrf },
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error ?? 'Failed.'); return; }
        showSuccess('Cancelled', 'Reservation has been cancelled.');
        await Promise.all([loadAdminSlots(), loadAdminData()]);
    } catch (e) {
        showError('Network error.'); console.error('adminCancel:', e);
    }
}

function renderAdminSlotGrid() {
    const grid = document.getElementById('admin-slot-grid');
    if (!grid || !allSlots.length) return;

    const colors = {
        available: 'bg-green-100 border-green-300 text-green-800',
        occupied:  'bg-red-100 border-red-300 text-red-700',
        reserved:  'bg-yellow-100 border-yellow-300 text-yellow-800',
        disabled:  'bg-gray-100 border-gray-300 text-gray-500',
    };

    grid.innerHTML = allSlots.map(function(slot) {
        const cls = colors[slot.status] ?? colors.disabled;
        return '<button class="js-admin-slot-btn flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold ' + cls + ' hover:opacity-80 transition-opacity" data-slot-id="' + slot.id + '">' +
               '<span>' + esc(slot.slot_label) + '</span><span class="capitalize opacity-70">' + slot.status + '</span></button>';
    }).join('');

    grid.querySelectorAll('.js-admin-slot-btn').forEach(function(btn) {
        const slot = allSlots.find(function(s) { return s.id === parseInt(btn.dataset.slotId); });
        if (slot) btn.addEventListener('click', function() { showAdminSlotMenu(slot); });
    });
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const fmtTime     = function(iso) { return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'; };
const fmtDatetime = function(iso) { return iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'; };
const cap         = function(s)   { return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const esc         = function(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
const countdown   = function(ts)  { const r = ts - Date.now(); if (r <= 0) return 'Expired'; const m = Math.floor(r/60000), s = Math.floor((r%60000)/1000); return m > 0 ? m + 'm ' + s + 's' : s + 's'; };
const debounce    = function(fn, ms) { let t; return function() { const a = arguments; clearTimeout(t); t = setTimeout(function() { fn.apply(null, a); }, ms); }; };

function showSuccess(title, html) {
    html = html || '';
    typeof Swal !== 'undefined'
        ? Swal.fire({ title: title, html: html, icon: 'success', confirmButtonColor: '#10b981', timer: 4000, timerProgressBar: true })
        : alert('✅ ' + title);
}
function showError(msg) {
    typeof Swal !== 'undefined'
        ? Swal.fire({ title: 'Error', text: msg, icon: 'error', confirmButtonColor: '#ef4444' })
        : alert('❌ ' + msg);
}
async function confirm2(title, text) {
    if (typeof Swal !== 'undefined') {
        const r = await Swal.fire({ title: title, text: text, icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280', confirmButtonText: 'Yes, proceed' });
        return r.isConfirmed;
    }
    return confirm(title + '\n' + text);
}