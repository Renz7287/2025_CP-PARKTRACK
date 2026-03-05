from users.models import Vehicle
import json
from datetime import timedelta
from django.contrib.auth.decorators import login_required
from django.db import models
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from settings.models import ParkingSlot, Camera
import os
from django.conf import settings
from .models import Reservation


@login_required
def reservation(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    user_vehicles = Vehicle.objects.filter(
        owner__user=request.user
    ).values_list('plate_number', flat=True)

    camera = Camera.objects.filter(is_active=True).first()

    try:
        snapshot_url = reverse('parking_allotment:api-latest-clean-snapshot')  # was api-clean-snapshot
    except Exception:
        snapshot_url = ''

    js_config = {
        'isAdmin':   'true' if getattr(request.user, 'is_admin', False) else 'false',
        'cameraId':  camera.id if camera else None,
        'urls': {
            'snapshot':        snapshot_url,
            'slots':           reverse('reservation:reservation_slots'),
            'myReservations':  reverse('reservation:my_reservations'),
            'create':          reverse('reservation:create_reservation'),
            'adminAll':        reverse('reservation:admin_all_reservations'),
            'adminSlotToggle': reverse('reservation:admin_toggle_slot'),
            'cancelBase':      '/reservation/',
            'cancelSuffix':    '/cancel/',
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
        now_local = timezone.localtime(timezone.now())
        naive_dt  = timezone.datetime(
            now_local.year, now_local.month, now_local.day,
            t.hour, t.minute
        )
        aware_dt = timezone.make_aware(naive_dt, timezone.get_current_timezone())

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
    include_disabled = request.GET.get('include_disabled') == '1'
    is_admin = getattr(request.user, 'is_admin', False) or request.user.is_staff

    if include_disabled and is_admin:
        qs = ParkingSlot.objects.filter(
            models.Q(is_active=True) | models.Q(status='disabled')
        ).select_related('camera')
    else:
        qs = ParkingSlot.objects.filter(is_active=True).select_related('camera')

    camera_id = request.GET.get('camera_id')
    if camera_id:
        qs = qs.filter(camera_id=camera_id)

    reserved_slot_ids = set(
        Reservation.objects.filter(status='active').values_list('slot_id', flat=True)
    )

    # Read Pi occupancy from status.json — keyed by slot_label
    pi_occupied_labels = set()
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')
    if os.path.exists(status_path):
        try:
            with open(status_path, 'r') as f:
                status_data = json.load(f)
            for s in status_data.get('slots', []):
                if s.get('occupied'):
                    pi_occupied_labels.add(s.get('slot_label', ''))
        except Exception:
            pass

    slots = []
    for slot in qs:
        d = slot.to_dict()
        pi_occupied = slot.slot_label in pi_occupied_labels

        if slot.id in reserved_slot_ids:
            d['status'] = 'reserved'
        elif pi_occupied:
            d['status'] = 'occupied'

        d['is_reservable'] = (
            slot.is_active
            and slot.status == 'available'
            and slot.id not in reserved_slot_ids
            and not pi_occupied
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
        search_terms = search.split()

        if len(search_terms) > 1:
            q = Q()
            for term in search_terms:
                q &= (
                    Q(plate_number__icontains=term)
                    | Q(slot__slot_label__icontains=term)
                    | Q(user__first_name__icontains=term)
                    | Q(user__last_name__icontains=term)
                )
        else:
            q = (
                Q(plate_number__icontains=search)
                | Q(slot__slot_label__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
            )

        qs = qs.filter(q).distinct()

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

@login_required
@require_http_methods(["POST"])
def admin_toggle_slot(request):
    """
    POST /reservation/admin/slot/toggle/
    Body: { slot_id: int, action: 'enable' | 'disable' }
    Lets admins mark a slot as disabled (taken offline) or re-enable it.
    """
    if not (getattr(request.user, 'is_admin', False) or request.user.is_staff):
        return JsonResponse({'error': 'Forbidden — admin access required.'}, status=403)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    slot_id = body.get('slot_id')
    action  = body.get('action', '').strip()

    if not slot_id:
        return JsonResponse({'error': 'slot_id is required.'}, status=400)
    if action not in ('enable', 'disable'):
        return JsonResponse({'error': 'action must be "enable" or "disable".'}, status=400)

    try:
        slot = ParkingSlot.objects.get(id=slot_id)
    except ParkingSlot.DoesNotExist:
        return JsonResponse({'error': 'Slot not found.'}, status=404)

    if action == 'disable':
        # Cancel any active reservation on this slot before disabling
        active_res = Reservation.objects.filter(slot=slot, status='active').first()
        if active_res:
            active_res.cancel(by_admin=True)
        slot.status    = 'disabled'
        slot.is_active = False
    else:
        slot.status    = 'available'
        slot.is_active = True

    slot.save(update_fields=['status', 'is_active', 'updated_at'])

    return JsonResponse({
        'success': True,
        'slot_id': slot.id,
        'new_status': slot.status,
        'is_active': slot.is_active,
    })