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

def latest_snapshot(request):
    snapshot_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'snapshots')
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')

    if not os.path.exists(snapshot_dir):
        return JsonResponse({'url': '', 'last_modified': None, 'vacant': 0})

    snapshots = [f for f in os.listdir(snapshot_dir) if f.endswith('.jpg')]
    if not snapshots:
        return JsonResponse({'url': '', 'last_modified': None, 'vacant': 0})

    latest_file = max(snapshots, key=lambda f: os.path.getmtime(os.path.join(snapshot_dir, f)))
    file_path = os.path.join(snapshot_dir, latest_file)
    url = settings.MEDIA_URL + 'video_stream/snapshots/' + latest_file
    last_modified_ms = int(os.path.getmtime(file_path) * 1000)

    vacant = 0
    # First, try reading the sidecar JSON saved at the moment the snapshot was taken
    sidecar_path = file_path.replace('.jpg', '.json')
    if os.path.exists(sidecar_path):
        try:
            with open(sidecar_path, 'r') as f:
                sidecar_data = json.load(f)
                vacant = sidecar_data.get('vacant', 0)
        except Exception:
            vacant = 0
    else:
        # Fallback to live status.json only if no sidecar exists yet
        if os.path.exists(status_path):
            try:
                with open(status_path, 'r') as f:
                    data = json.load(f)
                    vacant = data.get('vacant', 0)
            except Exception:
                vacant = 0

    return JsonResponse({'url': url, 'last_modified': last_modified_ms, 'vacant': vacant})

def vacant_slots_status(request):
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')

    if not os.path.exists(status_path):
        return JsonResponse({'vacant': 0})

    try:
        with open(status_path, 'r') as f:
            data = json.load(f)
            vacant_count = data.get('vacant', 0)
    except Exception as e:
        return JsonResponse({'error': 'Failed to read status.'}, status=500)

    return JsonResponse({'vacant': vacant_count})