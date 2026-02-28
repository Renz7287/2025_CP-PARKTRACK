from users.models import Vehicle
import json
from datetime import timedelta
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from settings.models import ParkingSlot, Camera
from .models import Reservation


@login_required
def reservation(request):
    """
    Renders the Reservations tab.

    KEY DESIGN DECISION: All API URLs are resolved in Python here and passed
    as context strings. This means any bad URL name causes an obvious 500 error
    at page load rather than silently crashing the <script> block and leaving
    window.PARK_TRACK = undefined (which produced the /undefined 404s).
    """
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    user_vehicles = Vehicle.objects.filter(
        owner__user=request.user
    ).values_list('plate_number', flat=True)

    camera = Camera.objects.filter(is_active=True).first()

    # Snapshot URL: try reservation-local proxy first, fall back to parkingAllotment.
    try:
        snapshot_url = reverse('parking_allotment:api-latest-snapshot')
    except Exception:
        snapshot_url = ''

    # cancelBase + id + cancelSuffix is assembled in JS.
    # We derive the base from the cancel URL pattern itself so it stays in sync.
    cancel_base = '/reservation/'
    cancel_suffix = '/cancel/'

    js_config = {
        'isAdmin':   'true' if getattr(request.user, 'is_admin', False) else 'false',
        'cameraId':  camera.id if camera else None,
        'urls': {
            'snapshot':       snapshot_url,
            'slots':          reverse('reservation:reservation_slots'),
            'myReservations': reverse('reservation:my_reservations'),
            'create':         reverse('reservation:create_reservation'),
            'adminAll':       reverse('reservation:admin_all_reservations'),
            'cancelBase':     cancel_base,
            'cancelSuffix':   cancel_suffix,
        }
    }

    context = {
        'is_partial':    is_ajax,
        'user_vehicles': user_vehicles,
        'camera':        camera,
        'js_config':     js_config,
    }

    return render(request, 'reservation/index.html', context)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _expire_stale_reservations():
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
    from django.utils.dateparse import parse_datetime, parse_time

    arrival_time_str = arrival_time_str.strip()

    if len(arrival_time_str) <= 5:
        t = parse_time(arrival_time_str)
        if not t:
            raise ValueError(f"Cannot parse time: {arrival_time_str!r}")
        # Use localtime so the comparison against timezone.now() is correct
        now_local = timezone.localtime(timezone.now())
        naive_dt  = timezone.datetime(
            now_local.year, now_local.month, now_local.day,
            t.hour, t.minute
        )
        aware_dt = timezone.make_aware(naive_dt, timezone.get_current_timezone())

        # If the time has already passed today, assume they mean tomorrow
        if aware_dt <= timezone.now():
            aware_dt += timezone.timedelta(days=1)

        return aware_dt

    dt = parse_datetime(arrival_time_str)
    if dt is None:
        raise ValueError(f"Cannot parse datetime: {arrival_time_str!r}")
    return dt if not timezone.is_naive(dt) else timezone.make_aware(dt)

# ---------------------------------------------------------------------------
# Slot availability
# ---------------------------------------------------------------------------

@login_required
@require_http_methods(["GET"])
def get_available_slots(request):
    _expire_stale_reservations()

    qs = ParkingSlot.objects.filter(is_active=True).select_related('camera')

    camera_id = request.GET.get('camera_id')
    if camera_id:
        qs = qs.filter(camera_id=camera_id)

    reserved_slot_ids = set(
        Reservation.objects.filter(status='active').values_list('slot_id', flat=True)
    )

    slots = []
    for slot in qs:
        d = slot.to_dict()
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
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    slot_id          = body.get('slot_id')
    plate_number     = body.get('plate_number', '').strip().upper()
    arrival_time_str = body.get('arrival_time', '').strip()

    if not slot_id:
        return JsonResponse({'error': 'slot_id is required.'}, status=400)
    if not plate_number:
        return JsonResponse({'error': 'plate_number is required.'}, status=400)
    if not arrival_time_str:
        return JsonResponse({'error': 'arrival_time is required.'}, status=400)

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

    _expire_stale_reservations()

    try:
        slot = ParkingSlot.objects.get(id=slot_id, is_active=True)
    except ParkingSlot.DoesNotExist:
        return JsonResponse({'error': 'Slot not found or inactive.'}, status=404)

    if slot.status != 'available':
        return JsonResponse(
            {'error': f'Slot {slot.slot_label} is currently "{slot.status}" and cannot be reserved.'},
            status=409,
        )

    if Reservation.objects.filter(slot=slot, status='active').exists():
        return JsonResponse(
            {'error': f'Slot {slot.slot_label} was just reserved by another user.'},
            status=409,
        )

    existing = Reservation.objects.filter(user=request.user, status='active').first()
    if existing:
        return JsonResponse(
            {'error': f'You already have an active reservation for slot {existing.slot.slot_label}. Please cancel it first.'},
            status=409,
        )

    reservation_obj = Reservation.objects.create(
        user=request.user,
        slot=slot,
        plate_number=plate_number,
        arrival_time=arrival_dt,
    )
    slot.status = 'reserved'
    slot.save(update_fields=['status', 'updated_at'])

    return JsonResponse({'success': True, 'reservation': reservation_obj.to_dict()}, status=201)


@login_required
@require_http_methods(["POST"])
def cancel_reservation(request, reservation_id):
    try:
        if getattr(request.user, 'is_admin', False) or request.user.is_staff:
            reservation_obj = Reservation.objects.select_related('slot').get(id=reservation_id)
        else:
            reservation_obj = Reservation.objects.select_related('slot').get(
                id=reservation_id, user=request.user
            )
    except Reservation.DoesNotExist:
        return JsonResponse({'error': 'Reservation not found.'}, status=404)

    if reservation_obj.status != 'active':
        return JsonResponse(
            {'error': f'Cannot cancel a reservation with status "{reservation_obj.status}".'},
            status=400,
        )

    is_admin_action = getattr(request.user, 'is_admin', False) or request.user.is_staff
    reservation_obj.cancel(by_admin=is_admin_action)

    return JsonResponse({'success': True, 'message': 'Reservation cancelled successfully.'})


# ---------------------------------------------------------------------------
# Admin-only endpoints
# ---------------------------------------------------------------------------

@login_required
@require_http_methods(["GET"])
def admin_get_all_reservations(request):
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