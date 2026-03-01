from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.utils import timezone
from utils.decorators import group_required
from .models import VehicleEntry
from django.db.models.functions import ExtractHour, ExtractWeekDay
from django.db.models import Count
import json


@group_required('Admin')
def parking_usage(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'parking_usage/index.html', context)


@require_POST
def increment_vehicle_count(request):
    """
    Creates a new VehicleEntry record to log a vehicle detection.
    Expects optional JSON body: { "type": "entry" | "exit" }
    """
    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        body = {}

    entry_type = body.get('type', 'entry')  # Default to 'entry'

    VehicleEntry.objects.create(entry_type=entry_type)
    return JsonResponse({'status': 'success'}, status=201)


def get_parking_stats(request):
    """
    Returns parking statistics for the current week.
    - daily_table: list of [in_count, out_count] per day (Mon–Sun)
    - hourly_by_day: dict of day_index -> 24-hour counts for that day
    - summary: total entries this week, peak hour, peak day
    """
    now = timezone.now()
    # Get the start of the current week (Monday)
    week_start = now - timezone.timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    weekly_entries = VehicleEntry.objects.filter(timestamp__gte=week_start)

    # --- Daily totals (Mon=2 ... Sun=1 in Django's ExtractWeekDay) ---
    # Django: Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6, Sat=7
    DJANGO_DAY_TO_INDEX = {2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 1: 6}

    daily_stats = (
        weekly_entries
        .annotate(day=ExtractWeekDay('timestamp'))
        .values('day', 'entry_type')
        .annotate(total=Count('id'))
        .order_by('day')
    )

    # Structure: [[in, out], ...] for Mon-Sun
    daily_table = [[0, 0] for _ in range(7)]
    for entry in daily_stats:
        idx = DJANGO_DAY_TO_INDEX.get(entry['day'])
        if idx is not None:
            if entry.get('entry_type') == 'exit':
                daily_table[idx][1] += entry['total']
            else:
                daily_table[idx][0] += entry['total']

    # --- Hourly breakdown per day of week ---
    hourly_stats = (
        weekly_entries
        .annotate(day=ExtractWeekDay('timestamp'), hour=ExtractHour('timestamp'))
        .values('day', 'hour')
        .annotate(count=Count('id'))
        .order_by('day', 'hour')
    )

    hourly_by_day = {i: [0] * 24 for i in range(7)}
    for item in hourly_stats:
        idx = DJANGO_DAY_TO_INDEX.get(item['day'])
        if idx is not None and item['hour'] is not None:
            hourly_by_day[idx][item['hour']] += item['count']

    # --- Summary stats ---
    total_entries = sum(day[0] for day in daily_table)
    total_exits = sum(day[1] for day in daily_table)

    # Find peak hour across the whole week
    all_hourly = [0] * 24
    for day_hours in hourly_by_day.values():
        for h, count in enumerate(day_hours):
            all_hourly[h] += count
    peak_hour = all_hourly.index(max(all_hourly)) if any(all_hourly) else None

    # Find peak day
    day_totals = [day[0] for day in daily_table]
    peak_day_idx = day_totals.index(max(day_totals)) if any(day_totals) else None
    days_of_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

    return JsonResponse({
        'daily_table': daily_table,
        'hourly_by_day': hourly_by_day,
        'summary': {
            'total_entries': total_entries,
            'total_exits': total_exits,
            'peak_hour': f"{peak_hour}:00" if peak_hour is not None else 'N/A',
            'peak_day': days_of_week[peak_day_idx] if peak_day_idx is not None else 'N/A',
        }
    })