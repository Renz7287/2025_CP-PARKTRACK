import json
from datetime import timedelta
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from settings.models import ParkingSlot       # ← single source of truth
from .models import Reservation

@login_required
def reservation(request):
    """
    Renders the Reservations tab.
    Handles both full-page loads and AJAX partial loads
    (same pattern used across the rest of the project).
    """
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    context = {
        'is_partial': is_ajax,
    }

    return render(request, 'reservation/index.html', context)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _expire_stale_reservations():
    """
    Expire all active reservations whose expiry_time has passed and free their slots.

    In production replace this with a Celery periodic task running every minute:

        @shared_task
        def expire_reservations():
            from reservations.views import _expire_stale_reservations
            _expire_stale_reservations()
    """
    stale = Reservation.objects.filter(
        status='active',
        expiry_time__lt=timezone.now(),
    ).select_related('slot')

    for res in stale:
        res.status = 'expired'
        res.save(update_fields=['status'])
        if res.slot.status == 'reserved':
            res.slot.status = 'available'
            res.slot.save(update_fields=['status', 'updated_at'])


def _parse_arrival_time(arrival_time_str):
    """
    Parse arrival_time from the request body.
    Accepts "HH:MM" (assumed today) or any ISO datetime string.
    Returns a timezone-aware datetime, or raises ValueError.
    """
    from django.utils.dateparse import parse_datetime, parse_time

    arrival_time_str = arrival_time_str.strip()

    if len(arrival_time_str) <= 5:          # "HH:MM" shorthand
        t = parse_time(arrival_time_str)
        if not t:
            raise ValueError(f"Cannot parse time: {arrival_time_str!r}")
        now = timezone.localtime(timezone.now())
        naive_dt = timezone.datetime(now.year, now.month, now.day, t.hour, t.minute)
        return timezone.make_aware(naive_dt)

    dt = parse_datetime(arrival_time_str)
    if dt is None:
        raise ValueError(f"Cannot parse datetime: {arrival_time_str!r}")
    return dt if not timezone.is_naive(dt) else timezone.make_aware(dt)


# ---------------------------------------------------------------------------
# Slot availability  (used by the visual slot picker)
# ---------------------------------------------------------------------------

@login_required
@require_http_methods(["GET"])
def get_available_slots(request):
    """
    GET /reservations/slots/?camera_id=<id>

    Returns all active ParkingSlots for a camera, including polygon_points
    so the frontend can draw clickable overlays on the parking snapshot.
    Expires stale reservations first so statuses are accurate.
    """
    _expire_stale_reservations()

    qs = ParkingSlot.objects.filter(is_active=True).select_related('camera')

    camera_id = request.GET.get('camera_id')
    if camera_id:
        qs = qs.filter(camera_id=camera_id)

    # Collect slot ids that have an active reservation so we can surface that
    reserved_slot_ids = set(
        Reservation.objects.filter(status='active').values_list('slot_id', flat=True)
    )

    slots = []
    for slot in qs:
        d = slot.to_dict()
        # Add a convenience flag for the frontend
        d['is_reservable'] = (
            slot.is_active
            and slot.status == 'available'
            and slot.id not in reserved_slot_ids
        )
        slots.append(d)

    return JsonResponse({'slots': slots})


# ---------------------------------------------------------------------------
# User reservation endpoints
# ---------------------------------------------------------------------------

@login_required
@require_http_methods(["GET"])
def get_my_reservations(request):
    """
    GET /reservations/my/
    Returns the logged-in user's active reservations.
    """
    _expire_stale_reservations()

    reservations = (
        Reservation.objects
        .filter(user=request.user, status='active')
        .select_related('slot', 'slot__camera')
    )
    return JsonResponse({
        'reservations': [r.to_dict() for r in reservations]
    })


@login_required
@require_http_methods(["POST"])
def create_reservation(request):
    """
    POST /reservations/create/
    Body JSON:
        { "slot_id": <int>, "plate_number": "ABC-123", "arrival_time": "HH:MM" }

    Rules:
    - Slot must be active and currently 'available'
    - Arrival time must be in the future and within 24 hours
    - User can only have 1 active reservation at a time
    """
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    slot_id          = body.get('slot_id')
    plate_number     = body.get('plate_number', '').strip().upper()
    arrival_time_str = body.get('arrival_time', '').strip()

    # ── Basic presence check ──────────────────────────────────────────────
    if not slot_id:
        return JsonResponse({'error': 'slot_id is required.'}, status=400)
    if not plate_number:
        return JsonResponse({'error': 'plate_number is required.'}, status=400)
    if not arrival_time_str:
        return JsonResponse({'error': 'arrival_time is required.'}, status=400)

    # ── Parse + validate arrival time ────────────────────────────────────
    try:
        arrival_dt = _parse_arrival_time(arrival_time_str)
    except ValueError as e:
        return JsonResponse(
            {'error': f'Invalid arrival_time — use HH:MM or ISO format. ({e})'},
            status=400,
        )

    now = timezone.now()
    if arrival_dt <= now:
        return JsonResponse({'error': 'Arrival time must be in the future.'}, status=400)
    if arrival_dt > now + timedelta(hours=24):
        return JsonResponse(
            {'error': 'Reservations can only be made up to 24 hours in advance.'},
            status=400,
        )

    # ── Expire stale reservations before availability check ───────────────
    _expire_stale_reservations()

    # ── Slot check ───────────────────────────────────────────────────────
    try:
        slot = ParkingSlot.objects.get(id=slot_id, is_active=True)
    except ParkingSlot.DoesNotExist:
        return JsonResponse({'error': 'Slot not found or inactive.'}, status=404)

    if slot.status != 'available':
        return JsonResponse(
            {'error': f'Slot {slot.slot_label} is currently "{slot.status}" and cannot be reserved.'},
            status=409,
        )

    # Double-check there is no active reservation already on this slot
    # (handles race conditions the UniqueConstraint will catch at DB level too)
    if Reservation.objects.filter(slot=slot, status='active').exists():
        return JsonResponse(
            {'error': f'Slot {slot.slot_label} was just reserved by another user.'},
            status=409,
        )

    # ── One active reservation per user ──────────────────────────────────
    existing = Reservation.objects.filter(user=request.user, status='active').first()
    if existing:
        return JsonResponse(
            {
                'error': (
                    f'You already have an active reservation for slot '
                    f'{existing.slot.slot_label}. Please cancel it first.'
                )
            },
            status=409,
        )

    # ── Create reservation + mark slot as reserved ────────────────────────
    reservation = Reservation.objects.create(
        user=request.user,
        slot=slot,
        plate_number=plate_number,
        arrival_time=arrival_dt,
    )
    slot.status = 'reserved'
    slot.save(update_fields=['status', 'updated_at'])

    return JsonResponse({'success': True, 'reservation': reservation.to_dict()}, status=201)


@login_required
@require_http_methods(["POST"])
def cancel_reservation(request, reservation_id):
    """
    POST /reservations/<id>/cancel/
    Users can cancel their own; admins can cancel any.
    """
    try:
        if getattr(request.user, 'is_admin', False) or request.user.is_staff:
            reservation = Reservation.objects.select_related('slot').get(id=reservation_id)
        else:
            reservation = Reservation.objects.select_related('slot').get(
                id=reservation_id, user=request.user
            )
    except Reservation.DoesNotExist:
        return JsonResponse({'error': 'Reservation not found.'}, status=404)

    if reservation.status != 'active':
        return JsonResponse(
            {'error': f'Cannot cancel a reservation with status "{reservation.status}".'},
            status=400,
        )

    is_admin_action = getattr(request.user, 'is_admin', False) or request.user.is_staff
    reservation.cancel(by_admin=is_admin_action)

    return JsonResponse({'success': True, 'message': 'Reservation cancelled successfully.'})


# ---------------------------------------------------------------------------
# Admin-only endpoints
# ---------------------------------------------------------------------------

@login_required
@require_http_methods(["GET"])
def admin_get_all_reservations(request):
    """
    GET /reservations/admin/all/?status=all|active|expired|cancelled&search=<term>
    Admin-only: returns all reservations with optional filtering.
    """
    if not (getattr(request.user, 'is_admin', False) or request.user.is_staff):
        return JsonResponse({'error': 'Forbidden — admin access required.'}, status=403)

    _expire_stale_reservations()

    status_filter = request.GET.get('status', 'all').strip()
    search        = request.GET.get('search', '').strip()

    qs = Reservation.objects.select_related('slot', 'slot__camera', 'user').order_by('-created_at')

    if status_filter in ('active', 'expired', 'cancelled', 'fulfilled'):
        qs = qs.filter(status=status_filter)

    if search:
        qs = qs.filter(
            Q(plate_number__icontains=search)
            | Q(slot__slot_label__icontains=search)
            | Q(user__username__icontains=search)
            | Q(user__first_name__icontains=search)
            | Q(user__last_name__icontains=search)
        )

    # Summary always counts across ALL reservations (ignoring current filter)
    all_res = Reservation.objects.all()
    summary = {
        'total':     all_res.count(),
        'active':    all_res.filter(status='active').count(),
        'expired':   all_res.filter(status='expired').count(),
        'cancelled': all_res.filter(status='cancelled').count(),
    }

    return JsonResponse({
        'reservations': [r.to_dict() for r in qs],
        'summary':      summary,
    })