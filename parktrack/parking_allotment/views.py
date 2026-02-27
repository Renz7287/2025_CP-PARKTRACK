from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from utils.decorators import group_required
import os, json, tempfile


@group_required('Admin', 'Driver')
def parking_allotment(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    return render(request, 'parking_allotment/index.html', {'is_partial': is_ajax})

@csrf_exempt
def upload_video(request):
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=405)
    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        return JsonResponse({'error': 'No file received'}, status=400)
    live_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream')
    os.makedirs(live_dir, exist_ok=True)
    dest_path = os.path.join(live_dir, 'input.mp4')
    with open(dest_path, 'wb') as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)
    return JsonResponse({'status': 'uploaded', 'path': dest_path})

@csrf_exempt
def upload_snapshot(request):
    """
    POST /parking-allotment/api/upload-snapshot/

    Called by the Pi after each periodic snapshot.
    Saves the JPEG and a JSON sidecar to MEDIA_ROOT/video_stream/snapshots/
    so Django can serve them to the browser via latest_snapshot().

    Headers:
        X-API-KEY  — must match settings.UPLOAD_API_KEY

    Form data:
        snapshot   — JPEG image file
        occupied   — integer
        vacant     — integer
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    snapshot_file = request.FILES.get('snapshot')
    if not snapshot_file:
        return JsonResponse({'error': 'No snapshot file received'}, status=400)

    occupied = int(request.POST.get('occupied', 0))
    vacant   = int(request.POST.get('vacant',   0))

    snapshot_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'snapshots')
    os.makedirs(snapshot_dir, exist_ok=True)

    filename     = os.path.basename(snapshot_file.name)
    jpg_path     = os.path.join(snapshot_dir, filename)
    sidecar_path = jpg_path.replace('.jpg', '.json')

    with open(jpg_path, 'wb') as f:
        for chunk in snapshot_file.chunks():
            f.write(chunk)

    with open(sidecar_path, 'w') as f:
        json.dump({'occupied': occupied, 'vacant': vacant}, f)

    url = settings.MEDIA_URL + 'video_stream/snapshots/' + filename
    return JsonResponse({'status': 'ok', 'url': url})

@csrf_exempt
def upload_status(request):
    """
    POST /parking-allotment/api/upload-status/

    Called by the Pi every WRITE_STATUS_EVERY frames to push the current
    occupancy JSON to Django so parking_status() can serve it.

    Headers:
        X-API-KEY  — must match settings.UPLOAD_API_KEY

    Body (JSON):
        { "timestamp": ..., "occupied": ..., "vacant": ..., "slots": [...] }
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    video_dir   = os.path.join(settings.MEDIA_ROOT, 'video_stream')
    os.makedirs(video_dir, exist_ok=True)
    status_path = os.path.join(video_dir, 'status.json')

    tmp_fd, tmp_path = tempfile.mkstemp(dir=video_dir)
    try:
        with os.fdopen(tmp_fd, 'w') as f:
            json.dump(data, f)
        os.replace(tmp_path, status_path)
    except Exception as e:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'status': 'ok'})

def parking_status(request):
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')
    if not os.path.exists(status_path):
        return JsonResponse({'occupied': 0, 'vacant': 0, 'slots': []})
    try:
        with open(status_path, 'r') as f:
            data = json.load(f)
    except Exception:
        return JsonResponse({'error': 'Failed to read status'}, status=500)
    return JsonResponse(data)

def latest_snapshot(request):
    snapshot_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'snapshots')
    status_path  = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')

    if not os.path.exists(snapshot_dir):
        return JsonResponse({'url': '', 'last_modified': None, 'vacant': 0})

    snapshots = [f for f in os.listdir(snapshot_dir) if f.endswith('.jpg')]
    if not snapshots:
        return JsonResponse({'url': '', 'last_modified': None, 'vacant': 0})

    latest_file      = max(snapshots, key=lambda f: os.path.getmtime(os.path.join(snapshot_dir, f)))
    file_path        = os.path.join(snapshot_dir, latest_file)
    url              = settings.MEDIA_URL + 'video_stream/snapshots/' + latest_file
    last_modified_ms = int(os.path.getmtime(file_path) * 1000)

    vacant       = 0
    sidecar_path = file_path.replace('.jpg', '.json')
    if os.path.exists(sidecar_path):
        try:
            with open(sidecar_path, 'r') as f:
                vacant = json.load(f).get('vacant', 0)
        except Exception:
            vacant = 0
    elif os.path.exists(status_path):
        try:
            with open(status_path, 'r') as f:
                vacant = json.load(f).get('vacant', 0)
        except Exception:
            vacant = 0

    return JsonResponse({'url': url, 'last_modified': last_modified_ms, 'vacant': vacant})

def vacant_slots_status(request):
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')
    if not os.path.exists(status_path):
        return JsonResponse({'vacant': 0})
    try:
        with open(status_path, 'r') as f:
            vacant_count = json.load(f).get('vacant', 0)
    except Exception:
        return JsonResponse({'error': 'Failed to read status.'}, status=500)
    return JsonResponse({'vacant': vacant_count})