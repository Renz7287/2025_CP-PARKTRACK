from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from utils.decorators import group_required
import os, json


# Create your views here.

@group_required('Admin', 'Driver')
def parking_allotment(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'parking_allotment/index.html', context)

@csrf_exempt
def upload_video(request):
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        return JsonResponse({'error': 'No file recieved'}, status=400)

    live_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream')
    os.makedirs(live_dir, exist_ok=True)

    dest_path = os.path.join(live_dir, 'input.mp4')

    # Save the uploaded file
    with open(dest_path, 'wb') as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)

    return JsonResponse({'status': 'uploaded', 'path': dest_path})

def parking_status(request):
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')

    if not os.path.exists(status_path):
        return JsonResponse({'occupied': 0, 'vacant': 0, 'slots': []})
    
    try:
        with open(status_path, 'r') as f:
            data = json.load(f)

    except Exception as e:
        return JsonResponse({'error': 'Failed to read status'}, status=500)
    
    return JsonResponse(data)