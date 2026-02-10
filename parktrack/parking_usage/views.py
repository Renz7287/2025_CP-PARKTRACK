from django.shortcuts import render
from utils.decorators import group_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import VehicleEntry
from django.db.models.functions import ExtractHour
from django.db.models import Count
import json

@group_required('Admin')
def parking_usage(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'parking_usage/index.html', context)


@csrf_exempt 
def increment_vehicle_count(request):
    if request.method == 'POST':
        VehicleEntry.objects.create() 
        return JsonResponse({'status': 'success'}, status=201)
    return JsonResponse({'error': 'Invalid request'}, status=400)

def get_parking_stats(request):
    # Aggregates entries by hour for the chart
    stats = VehicleEntry.objects.annotate(hour=ExtractHour('timestamp')) \
                                .values('hour') \
                                .annotate(count=Count('id')) \
                                .order_by('hour')
    
    # Aggregates total entries per day for the table
    from django.db.models.functions import ExtractWeekDay
    daily_stats = VehicleEntry.objects.annotate(day=ExtractWeekDay('timestamp')) \
                                      .values('day') \
                                      .annotate(total=Count('id')) \
                                      .order_by('day')

    # Mapping Django's 1-7 (Sun-Sat) to your table's order
    # Mon=2, Tue=3, Wed=4, Thu=5, Fri=6, Sat=7, Sun=1
    daily_counts = {2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 1:0}
    for entry in daily_stats:
        daily_counts[entry['day']] = entry['total']

    # data_points for 24-hour chart
    data_points = [0] * 24
    for item in stats:
        if item['hour'] is not None:
            data_points[item['hour']] = item['count']
        
    return JsonResponse({
        'hourly_counts': data_points,
        'daily_table': list(daily_counts.values()) # Returns totals in Mon-Sun order
    })