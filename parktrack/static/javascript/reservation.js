/**
 * reservation.js
 * Parking slot reservation tab — user slot picker, form, and admin table.
 * Follows the same export/initialize pattern as other tabs (parkingAllotment, etc.)
 * Config is read inside initializeReservation() so AJAX reloads always get fresh values.
 */

// Module-level state (reset on each initialize call)
let allSlots        = [];
let selectedSlotId  = null;
let snapshotNatural = { w: 0, h: 0 };
let countdownTimer  = null;
let resizeObserver  = null;

// Read config fresh each call — never at module-load time
// AFTER (fixed):
function cfg() {
    // If PARK_TRACK isn't set yet, try to extract it from the inline script tag
    if (!window.PARK_TRACK) {
        const scriptTags = document.querySelectorAll('script:not([src])');
        for (const s of scriptTags) {
            if (s.textContent.includes('PARK_TRACK')) {
                try { eval(s.textContent); } catch(e) {}
                break;
            }
        }
    }
    return {
        api:      window.PARK_TRACK?.urls      ?? {},
        isAdmin:  window.PARK_TRACK?.isAdmin   ?? false,
        csrf:     window.PARK_TRACK?.csrfToken ?? '',
        cameraId: window.PARK_TRACK?.cameraId  ?? null,
    };
}

export function initializeReservation() {
    console.log('PARK_TRACK at init time:', JSON.stringify(window.PARK_TRACK));
    if (!document.querySelector('.reservations-section')) return;
    teardown();
    cfg().isAdmin ? initAdmin() : initUser();
}

function teardown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (resizeObserver) { resizeObserver.disconnect();   resizeObserver  = null; }
    allSlots        = [];
    selectedSlotId  = null;
    snapshotNatural = { w: 0, h: 0 };
}

// ─── USER VIEW ────────────────────────────────────────────────────────────────

async function initUser() {
    console.log('initUser called, api config:', cfg().api);
    bindFormEvents();
    // Load slots and reservations immediately — don't wait on snapshot
    await Promise.all([loadSlots(), loadMyReservations()]);
    // Load snapshot separately — it will call drawOverlay() itself once the image loads
    loadSnapshot();
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

    // Reset to loading state before every attempt
    err?.classList.add('hidden');
    img.classList.add('hidden');
    skel?.classList.remove('hidden');

    try {
        const url = new URL(api.snapshot, location.origin);
        if (cameraId) url.searchParams.set('camera_id', cameraId);
        url.searchParams.set('t', Date.now());

        const res  = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        console.log('Snapshot response:', data); // ← temp debug line

        if (!data.url) {
            // No snapshot file exists yet (camera hasn't run)
            skel?.classList.add('hidden');
            err?.classList.remove('hidden');
            console.warn('loadSnapshot: no snapshot file available yet');
            return;
        }

        return new Promise(resolve => {
            img.onload = () => {
                snapshotNatural.w = img.naturalWidth  || img.clientWidth  || 640;
                snapshotNatural.h = img.naturalHeight || img.clientHeight || 360;
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
                console.error('loadSnapshot: image failed to load from URL:', data.url);
                resolve();
            };
            // Use absolute URL to be safe with relative paths
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
    if (!api.slots) {
        console.warn('loadSlots: api.slots not ready');
        return;
    }
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

// SVG polygon overlay drawn over the parking snapshot
function drawOverlay() {
    const container = document.getElementById('slot-overlay-container');
    const img       = document.getElementById('res-parking-snapshot');
    if (!container || !img) return;

    // If image isn't visible/loaded yet, wait for it
    if (img.classList.contains('hidden') || !img.clientWidth || !img.clientHeight) {
        if (img.complete && img.naturalWidth) {
            // Image is loaded but not yet visible — try again next frame
            requestAnimationFrame(drawOverlay);
        }
        return;
    }

    const rw = img.clientWidth  || img.offsetWidth;
    const rh = img.clientHeight || img.offsetHeight;
    if (!rw || !rh) return;

    const sx = snapshotNatural.w ? rw / snapshotNatural.w : 1;
    const sy = snapshotNatural.h ? rh / snapshotNatural.h : 1;

    const NS  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;top:0;left:0;';

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

        const c    = palette[slot.status] ?? palette.disabled;
        const sel  = slot.id === selectedSlotId;
        const ptStr = pts.map(([x, y]) => `${(x*sx).toFixed(1)},${(y*sy).toFixed(1)}`).join(' ');

        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points',       ptStr);
        poly.setAttribute('fill',         sel ? 'rgba(124,209,249,0.45)' : c.fill);
        poly.setAttribute('stroke',       sel ? '#0ea5e9' : c.stroke);
        poly.setAttribute('stroke-width', sel ? '3' : '2');
        poly.style.cursor        = slot.is_reservable ? 'pointer' : 'default';
        poly.style.pointerEvents = slot.is_reservable ? 'auto' : 'none';
        poly.style.transition    = 'fill 0.15s';

        if (slot.is_reservable) {
            poly.addEventListener('mouseenter', () => { if (!sel) poly.setAttribute('fill', c.hover); });
            poly.addEventListener('mouseleave', () => { if (!sel) poly.setAttribute('fill', c.fill); });
            poly.addEventListener('click', () => selectSlot(slot));
        }

        const tip = document.createElementNS(NS, 'title');
        tip.textContent = `Slot ${slot.slot_label} — ${slot.status}`;
        poly.appendChild(tip);

        const cx = (pts.reduce((s,[x])=>s+x*sx,0)/pts.length).toFixed(1);
        const cy = (pts.reduce((s,[,y])=>s+y*sy,0)/pts.length).toFixed(1);
        const lbl = document.createElementNS(NS, 'text');
        lbl.setAttribute('x', cx); lbl.setAttribute('y', cy);
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('dominant-baseline', 'middle');
        lbl.setAttribute('fill',         sel ? '#0c4a6e' : '#fff');
        lbl.setAttribute('font-size',    '11');
        lbl.setAttribute('font-weight',  'bold');
        lbl.setAttribute('stroke',       'rgba(0,0,0,0.6)');
        lbl.setAttribute('stroke-width', '3');
        lbl.setAttribute('paint-order',  'stroke fill');
        lbl.setAttribute('pointer-events', 'none');
        lbl.textContent = slot.slot_label;

        svg.appendChild(poly);
        svg.appendChild(lbl);
    });

    container.innerHTML = '';
    container.appendChild(svg);
    container.style.pointerEvents = hasPolygons ? 'auto' : 'none';

    if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => { if (allSlots.length) drawOverlay(); });
        if (img) resizeObserver.observe(img);
    }
}

// Text grid below the image — alternative slot selection
function drawGrid() {
    const grid = document.getElementById('slot-grid');
    if (!grid) return;
    grid.innerHTML = ''; // clears skeleton loaders

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
        btn.className = `flex flex-col items-center justify-center h-14 rounded-xl border-2 font-bold text-sm transition-all duration-150 ${colors[slot.status] ?? colors.disabled} ${ring}`;
        btn.title     = `Slot ${slot.slot_label} (${slot.status})`;
        btn.innerHTML = `<span class="text-base leading-none">${slot.slot_label}</span>
                         <span class="text-[10px] font-normal mt-0.5 capitalize">${slot.status}</span>`;
        if (slot.is_reservable) btn.addEventListener('click', () => selectSlot(slot));
        grid.appendChild(btn);
    });
}

function selectSlot(slot) {
    selectedSlotId = slot.id;
    document.getElementById('selected-slot-badge')?.classList.remove('hidden');
    const lbl = document.getElementById('selected-slot-label');
    if (lbl) lbl.textContent = slot.slot_label;
    const info = document.getElementById('selected-slot-info');
    if (info) info.textContent = `Slot ${slot.slot_label} selected — fill in your details and click Reserve.`;
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
    const btn   = document.getElementById('submit-reservation-btn');
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
    document.getElementById('retry-snapshot')?.addEventListener('click', async () => {
        document.getElementById('snapshot-error')?.classList.add('hidden');
        document.getElementById('snapshot-skeleton')?.classList.remove('hidden');
        await loadSnapshot();
        if (allSlots.length) drawOverlay();
    });

    // Prevent picking a time in the past
    const timeInput = document.getElementById('res-arrival-time');
    if (timeInput) {
        const now = new Date();
        timeInput.min = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }

    document.getElementById('submit-reservation-btn')?.addEventListener('click', showConfirmModal);
    document.getElementById('modal-cancel-btn')?.addEventListener('click', hideConfirmModal);
    document.getElementById('modal-confirm-btn')?.addEventListener('click', submitReservation);
    document.getElementById('res-confirm-modal')?.addEventListener('click', e => {
        if (e.target.id === 'res-confirm-modal') hideConfirmModal();
    });
}

function showConfirmModal() {
    const plate = document.getElementById('res-plate-number')?.value;
    const time  = document.getElementById('res-arrival-time')?.value;
    const slot  = allSlots.find(s => s.id === selectedSlotId);
    if (!plate || !time || !slot) return;

    const [h, m] = time.split(':').map(Number);
    const arrival = new Date(); arrival.setHours(h, m, 0, 0);
    const expiry  = new Date(arrival.getTime() + 5 * 60_000);

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
            `Slot <strong>${data.reservation.slot_label}</strong> reserved. Expires at <strong>${fmtTime(data.reservation.expiry_time)}</strong>.`);
        clearSelection();
        document.getElementById('res-plate-number').value = '';
        document.getElementById('res-arrival-time').value  = '';
        await Promise.all([loadSlots(), loadMyReservations()]);
    } catch (e) {
        showError('Network error. Please try again.');
        console.error('submitReservation:', e);
    } finally {
        // Always reset button text AND state
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-calendar-check mr-2"></i>Reserve Slot';
        }
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
        el.innerHTML = `<p class="text-gray-400 text-sm text-center py-6">
            <i class="fa-solid fa-calendar-times text-3xl block mb-2"></i>
            You have no active reservations.</p>`;
        return;
    }

    el.innerHTML = list.map(r => `
        <div class="border border-gray-200 rounded-xl p-4 mb-3 bg-gray-50 hover:bg-white transition-colors">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-lg font-bold text-gray-800">${esc(r.slot_label)}</span>
                        <span class="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                    <p class="text-sm text-gray-500 mt-0.5"><i class="fa-solid fa-car-side mr-1"></i>${esc(r.plate_number)}</p>
                    <p class="text-xs text-gray-400 mt-0.5"><i class="fa-solid fa-clock mr-1"></i>Arrival: ${fmtTime(r.arrival_time)}</p>
                </div>
                <button class="js-cancel-res text-red-400 hover:text-red-600 transition-colors p-1" data-id="${r.id}">
                    <i class="fa-solid fa-times-circle text-xl"></i>
                </button>
            </div>
            <div class="flex items-center justify-between text-xs border-t border-gray-200 pt-2 mt-2">
                <span class="text-gray-400">Expires in:</span>
                <span class="js-countdown font-bold text-gray-700"
                      data-expiry="${new Date(r.expiry_time).getTime()}">
                    ${countdown(new Date(r.expiry_time).getTime())}
                </span>
            </div>
        </div>`).join('');

    el.querySelectorAll('.js-cancel-res').forEach(btn =>
        btn.addEventListener('click', () => cancelReservation(btn.dataset.id)));
}

async function cancelReservation(id) {
    const { api, csrf } = cfg();
    if (!await confirm2('Cancel Reservation?', 'Are you sure you want to cancel?')) return;
    try {
        const res  = await fetch(`${api.cancelBase}${id}${api.cancelSuffix}`, {
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
    document.querySelectorAll('.js-countdown').forEach(el => {
        const text = countdown(parseInt(el.dataset.expiry));
        el.textContent = text;
        el.className = `js-countdown font-bold ${parseInt(el.dataset.expiry) - Date.now() < 60_000 ? 'text-red-500' : 'text-gray-700'}`;
        if (text === 'Expired') needsRefresh = true;
    });
    if (needsRefresh) { loadMyReservations(); loadSlots(); }
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────

async function initAdmin() {
    await loadAdminData();
    document.getElementById('admin-search')?.addEventListener('input', debounce(loadAdminData, 300));
    document.getElementById('admin-filter-status')?.addEventListener('change', loadAdminData);
    document.getElementById('admin-refresh-btn')?.addEventListener('click', loadAdminData);
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

    tbody.innerHTML = list.map(r => {
        const can = r.status === 'active';
        return `<tr class="hover:bg-gray-50 transition-colors">
            <td class="py-3 px-4">${esc(r.user_name)}</td>
            <td class="py-3 px-4 font-mono font-semibold">${esc(r.plate_number)}</td>
            <td class="py-3 px-4 font-bold">${esc(r.slot_label)}</td>
            <td class="py-3 px-4 text-sm text-gray-600">${fmtDatetime(r.arrival_time)}</td>
            <td class="py-3 px-4 text-sm text-gray-600">${fmtDatetime(r.expiry_time)}</td>
            <td class="py-3 px-4">
                <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badge[r.status] ?? 'bg-gray-100 text-gray-600'}">
                    ${cap(r.status)}
                </span>
            </td>
            <td class="py-3 px-4">
                <button class="js-admin-cancel flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg
                    ${can ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'}"
                    data-id="${r.id}" ${!can ? 'disabled' : ''}>
                    <i class="fa-solid fa-ban"></i> Cancel
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.js-admin-cancel:not([disabled])').forEach(btn =>
        btn.addEventListener('click', () => adminCancel(btn.dataset.id)));
}

function renderAdminStats({ total, active, expired } = {}) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '0'; };
    set('admin-total-count',   total);
    set('admin-active-count',  active);
    set('admin-expired-count', expired);
}

async function adminCancel(id) {
    const { api, csrf } = cfg();
    if (!await confirm2('Cancel Reservation?', 'This will free the slot and cannot be undone.')) return;
    try {
        const res  = await fetch(`${api.cancelBase}${id}${api.cancelSuffix}`, {
            method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': csrf },
        });
        const data = await res.json();
        if (!res.ok) { showError(data.error ?? 'Failed.'); return; }
        showSuccess('Cancelled', 'Reservation has been cancelled.');
        loadAdminData();
    } catch (e) {
        showError('Network error.'); console.error('adminCancel:', e);
    }
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const fmtTime     = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
const fmtDatetime = iso => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
const cap         = s   => s ? s[0].toUpperCase() + s.slice(1) : '';
const esc         = s   => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const countdown   = ts  => { const r = ts - Date.now(); if (r <= 0) return 'Expired'; const m = Math.floor(r/60_000), s = Math.floor((r%60_000)/1_000); return m > 0 ? `${m}m ${s}s` : `${s}s`; };
const debounce    = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function showSuccess(title, html = '') {
    typeof Swal !== 'undefined'
        ? Swal.fire({ title, html, icon: 'success', confirmButtonColor: '#10b981', timer: 4000, timerProgressBar: true })
        : alert(`✅ ${title}`);
}
function showError(msg) {
    typeof Swal !== 'undefined'
        ? Swal.fire({ title: 'Error', text: msg, icon: 'error', confirmButtonColor: '#ef4444' })
        : alert(`❌ ${msg}`);
}
async function confirm2(title, text) {
    if (typeof Swal !== 'undefined') {
        const r = await Swal.fire({ title, text, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280', confirmButtonText: 'Yes, proceed' });
        return r.isConfirmed;
    }
    return confirm(`${title}\n${text}`);
}