import json
import os
from django.shortcuts import render
from django.http import JsonResponse
from django.utils import timezone
from django.db.models import Count, Q
from django.db.models.functions import ExtractWeekDay, ExtractHour
from datetime import timedelta
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from utils.decorators import group_required
from .models import OccupancySnapshot
from reservation.models import Reservation
from settings.models import ParkingSlot


@group_required('Admin')
def parking_usage(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    return render(request, 'parking_usage/index.html', {'is_partial': is_ajax})


@csrf_exempt
def record_occupancy(request):
    """
    Called by push_status in main.py to record a periodic occupancy snapshot.
    Expects JSON: { occupied: int, vacant: int }
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    try:
        data    = json.loads(request.body)
        occupied = int(data.get('occupied', 0))
        vacant   = int(data.get('vacant',   0))
        total    = occupied + vacant
        OccupancySnapshot.objects.create(occupied=occupied, vacant=vacant, total=total)
        return JsonResponse({'status': 'ok'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@group_required('Admin')
def get_parking_stats(request):
    now        = timezone.now()
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # 1. Live occupancy from status.json
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')
    live = {'occupied': 0, 'vacant': 0, 'total': 0, 'available': False}
    if os.path.exists(status_path):
        try:
            with open(status_path, 'r') as f:
                s = json.load(f)
            live['occupied']  = s.get('occupied', 0)
            live['vacant']    = s.get('vacant',   0)
            live['total']     = live['occupied'] + live['vacant']
            live['available'] = True
        except Exception:
            pass

    # 2. Reservation stats this week
    week_reservations = Reservation.objects.filter(created_at__gte=week_start)
    reservation_summary = {
        'total':     week_reservations.count(),
        'active':    week_reservations.filter(status='active').count(),
        'expired':   week_reservations.filter(status='expired').count(),
        'cancelled': week_reservations.filter(status='cancelled').count(),
        # 'fulfilled': week_reservations.filter(status='fulfilled').count(),
    }

    # 3. Reservations per day this week (Mon-Sun)
    DJANGO_DAY_TO_INDEX = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6}
    daily_reservations  = [0] * 7
    daily_stats = (
        week_reservations
        .annotate(day=ExtractWeekDay('created_at'))
        .values('day')
        .annotate(total=Count('id'))
    )
    for entry in daily_stats:
        idx = DJANGO_DAY_TO_INDEX.get(entry['day'])
        if idx is not None:
            daily_reservations[idx] = entry['total']

    peak_day_idx = daily_reservations.index(max(daily_reservations)) if any(daily_reservations) else None
    days_of_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

    # 4. Reservations per hour this week
    hourly_reservations = [0] * 24
    hourly_stats = (
        week_reservations
        .annotate(hour=ExtractHour('created_at'))
        .values('hour')
        .annotate(total=Count('id'))
    )
    for entry in hourly_stats:
        if entry['hour'] is not None:
            hourly_reservations[entry['hour']] = entry['total']

    peak_hour = hourly_reservations.index(max(hourly_reservations)) if any(hourly_reservations) else None

    # 5. Slot utilization — most reserved slots all time
    slot_utilization = (
        Reservation.objects
        .values('slot__slot_label')
        .annotate(total=Count('id'))
        .order_by('-total')[:8]
    )
    slot_labels = [s['slot__slot_label'] for s in slot_utilization]
    slot_counts = [s['total']            for s in slot_utilization]

    # 6. Occupancy trend this week from snapshots
    snapshots = (
        OccupancySnapshot.objects
        .filter(recorded_at__gte=week_start)
        .annotate(day=ExtractWeekDay('recorded_at'))
        .values('day')
        .annotate(
            avg_occupied=Count('occupied'),
        )
    )

    return JsonResponse({
        'live':                 live,
        'reservation_summary':  reservation_summary,
        'daily_reservations':   daily_reservations,
        'hourly_reservations':  hourly_reservations,
        'peak_day':             days_of_week[peak_day_idx] if peak_day_idx is not None else 'N/A',
        'peak_hour':            f"{peak_hour}:00" if peak_hour is not None else 'N/A',
        'slot_utilization':     {'labels': slot_labels, 'counts': slot_counts},
    })