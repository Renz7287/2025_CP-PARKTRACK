from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse, HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from utils.decorators import group_required
import os, json, tempfile, mimetypes


@group_required('Admin', 'Driver')
def parking_allotment(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    return render(request, 'parking_allotment/index.html', {'is_partial': is_ajax})


def serve_hls(request, filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.m3u8', '.ts'):
        return HttpResponse(status=404)

    if '..' in filename or filename.startswith('/'):
        return HttpResponse(status=400)

    file_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', filename)

    if not os.path.exists(file_path):
        return HttpResponse(status=404)

    content_type = 'application/vnd.apple.mpegurl' if ext == '.m3u8' else 'video/MP2T'

    def file_iterator(path, chunk_size=8192):
        with open(path, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    response = StreamingHttpResponse(file_iterator(file_path), content_type=content_type)
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Pragma']        = 'no-cache'
    response['Expires']       = '0'
    return response


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

    Called by the Pi after each periodic snapshot interval with the OVERLAID
    frame (polygons + detection status drawn on it).
    Saves the JPEG and a JSON sidecar to MEDIA_ROOT/video_stream/snapshots/
    so Django can serve them to the browser via latest_snapshot().

    Headers:
        X-API-KEY  — must match settings.UPLOAD_API_KEY

    Form data:
        snapshot   — JPEG image file (with polygon overlays drawn on it)
        occupied   — integer
        vacant     — integer
        improper   — integer  (new: vehicles straddling slot boundaries)
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
    improper = int(request.POST.get('improper', 0))

    snapshot_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'snapshots')
    os.makedirs(snapshot_dir, exist_ok=True)

    filename     = os.path.basename(snapshot_file.name)
    jpg_path     = os.path.join(snapshot_dir, filename)
    sidecar_path = jpg_path.replace('.jpg', '.json')

    with open(jpg_path, 'wb') as f:
        for chunk in snapshot_file.chunks():
            f.write(chunk)

    with open(sidecar_path, 'w') as f:
        json.dump({'occupied': occupied, 'vacant': vacant, 'improper': improper}, f)

    url = settings.MEDIA_URL + 'video_stream/snapshots/' + filename
    return JsonResponse({'status': 'ok', 'url': url})


@csrf_exempt
def upload_clean_snapshot(request):
    """
    POST /parking-allotment/api/upload-clean-snapshot/

    Called by the Pi alongside upload-snapshot, but sends the CLEAN frame
    (no polygon or detection overlays). Saved to a separate folder
    MEDIA_ROOT/video_stream/clean_snapshots/ so the Parking Layout Editor
    can fetch a clean background image for drawing slot polygons.

    Headers:
        X-API-KEY  — must match settings.UPLOAD_API_KEY

    Form data:
        snapshot   — JPEG image file (clean, no overlays)
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method'}, status=405)

    snapshot_file = request.FILES.get('snapshot')
    if not snapshot_file:
        return JsonResponse({'error': 'No snapshot file received'}, status=400)

    clean_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'clean_snapshots')
    os.makedirs(clean_dir, exist_ok=True)

    filename = os.path.basename(snapshot_file.name)
    jpg_path = os.path.join(clean_dir, filename)

    with open(jpg_path, 'wb') as f:
        for chunk in snapshot_file.chunks():
            f.write(chunk)

    url = settings.MEDIA_URL + 'video_stream/clean_snapshots/' + filename
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
        {
            "timestamp": ...,
            "occupied":  ...,
            "vacant":    ...,
            "improper":  ...,          ← new field
            "slots": [
                { "id": ..., "slot_label": ..., "occupied": bool, "status": str },
                ...
            ]
        }
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

    # Ensure improper key is always present for older Pi clients that don't send it
    data.setdefault('improper', 0)
    for slot in data.get('slots', []):
        slot.setdefault('status', 'occupied' if slot.get('occupied') else 'vacant')

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
        return JsonResponse({'occupied': 0, 'vacant': 0, 'improper': 0, 'slots': []})
    try:
        with open(status_path, 'r') as f:
            data = json.load(f)
    except Exception:
        return JsonResponse({'error': 'Failed to read status'}, status=500)

    # Back-fill improper for older status files
    data.setdefault('improper', 0)
    for slot in data.get('slots', []):
        slot.setdefault('status', 'occupied' if slot.get('occupied') else 'vacant')

    return JsonResponse(data)


def latest_snapshot(request):
    """
    Returns the latest OVERLAID snapshot (with detection polygons drawn on it)
    for display in the Parking Allotment snapshot section.
    Reads from MEDIA_ROOT/video_stream/snapshots/ — written by upload_snapshot().
    """
    snapshot_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'snapshots')
    status_path  = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')

    if not os.path.exists(snapshot_dir):
        return JsonResponse({'url': '', 'last_modified': None, 'vacant': 0, 'improper': 0})

    snapshots = [f for f in os.listdir(snapshot_dir) if f.endswith('.jpg')]
    if not snapshots:
        return JsonResponse({'url': '', 'last_modified': None, 'vacant': 0, 'improper': 0})

    latest_file      = max(snapshots, key=lambda f: os.path.getmtime(os.path.join(snapshot_dir, f)))
    file_path        = os.path.join(snapshot_dir, latest_file)
    url              = settings.MEDIA_URL + 'video_stream/snapshots/' + latest_file
    last_modified_ms = int(os.path.getmtime(file_path) * 1000)

    vacant   = 0
    improper = 0
    sidecar_path = file_path.replace('.jpg', '.json')
    if os.path.exists(sidecar_path):
        try:
            with open(sidecar_path, 'r') as f:
                sidecar      = json.load(f)
                vacant       = sidecar.get('vacant',   0)
                improper     = sidecar.get('improper', 0)
        except Exception:
            pass
    elif os.path.exists(status_path):
        try:
            with open(status_path, 'r') as f:
                status_data  = json.load(f)
                vacant       = status_data.get('vacant',   0)
                improper     = status_data.get('improper', 0)
        except Exception:
            pass

    return JsonResponse({
        'url':           url,
        'last_modified': last_modified_ms,
        'vacant':        vacant,
        'improper':      improper,
    })


def vacant_slots_status(request):
    status_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'status.json')
    if not os.path.exists(status_path):
        return JsonResponse({'vacant': 0, 'improper': 0})
    try:
        with open(status_path, 'r') as f:
            data = json.load(f)
            return JsonResponse({
                'vacant':   data.get('vacant',   0),
                'improper': data.get('improper', 0),
            })
    except Exception:
        return JsonResponse({'error': 'Failed to read status.'}, status=500)


def api_clean_snapshot(request):
    import time as time_module
    from settings.models import Camera

    clean_dir   = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'clean_snapshots')
    pinned_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'pinned_snapshot.jpg')

    # Always serve the pinned snapshot if it exists
    if os.path.exists(pinned_path):
        url = f'{settings.MEDIA_URL}video_stream/pinned_snapshot.jpg?v={int(time_module.time())}'
        return JsonResponse({'url': url})

    # Fall back to latest Pi-pushed snapshot
    if os.path.exists(clean_dir):
        snapshots = [f for f in os.listdir(clean_dir) if f.endswith('.jpg')]
        if snapshots:
            latest = max(snapshots, key=lambda f: os.path.getmtime(os.path.join(clean_dir, f)))
            url    = f'{settings.MEDIA_URL}video_stream/clean_snapshots/{latest}?v={int(time_module.time())}'
            return JsonResponse({'url': url})

    camera = Camera.objects.filter(is_active=True).first()
    if camera and camera.snapshot_url:
        return JsonResponse({'url': camera.snapshot_url})

    return JsonResponse({'url': ''})


@csrf_exempt
def push_stream_segment(request, filename):
    """
    PUT /parking-allotment/api/stream/push/<filename>
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return HttpResponse(status=401)

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.m3u8', '.ts'):
        return HttpResponse(status=400)

    if '/' in filename or '\\' in filename or '..' in filename:
        return HttpResponse(status=400)

    stream_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream')
    os.makedirs(stream_dir, exist_ok=True)

    file_path = os.path.join(stream_dir, filename)
    with open(file_path, 'wb') as f:
        f.write(request.body)

    return HttpResponse(status=204)


@csrf_exempt
def push_clean_stream_segment(request, filename):
    """
    PUT /parking-allotment/api/stream/push-clean/<filename>
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return HttpResponse(status=401)

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.m3u8', '.ts'):
        return HttpResponse(status=400)

    if '/' in filename or '\\' in filename or '..' in filename:
        return HttpResponse(status=400)

    clean_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'clean_stream')
    os.makedirs(clean_dir, exist_ok=True)

    file_path = os.path.join(clean_dir, filename)
    with open(file_path, 'wb') as f:
        f.write(request.body)

    return HttpResponse(status=204)


@csrf_exempt
def delete_stream_segment(request, filename):
    """DELETE /parking-allotment/api/stream/delete/<filename>"""
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return HttpResponse(status=401)
    if request.method != 'DELETE':
        return HttpResponse(status=405)
    if os.path.splitext(filename)[1].lower() != '.ts':
        return HttpResponse(status=400)
    if '/' in filename or '\\' in filename or '..' in filename:
        return HttpResponse(status=400)

    file_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', filename)
    try:
        os.remove(file_path)
    except FileNotFoundError:
        pass
    except OSError as e:
        return JsonResponse({'error': str(e)}, status=500)
    return HttpResponse(status=204)


@csrf_exempt
def delete_clean_stream_segment(request, filename):
    """DELETE /parking-allotment/api/stream/delete-clean/<filename>"""
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return HttpResponse(status=401)
    if request.method != 'DELETE':
        return HttpResponse(status=405)
    if os.path.splitext(filename)[1].lower() != '.ts':
        return HttpResponse(status=400)
    if '/' in filename or '\\' in filename or '..' in filename:
        return HttpResponse(status=400)

    file_path = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'clean_stream', filename)
    try:
        os.remove(file_path)
    except FileNotFoundError:
        pass
    except OSError as e:
        return JsonResponse({'error': str(e)}, status=500)
    return HttpResponse(status=204)


@csrf_exempt
def batch_delete_stream_segments(request):
    """
    POST /parking-allotment/api/stream/batch-delete/
    Body: { "files": ["segment_001.ts", ...], "stream": "overlay" | "clean" }
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return HttpResponse(status=401)
    if request.method != 'POST':
        return HttpResponse(status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    stream_type = data.get('stream', 'overlay')
    files       = data.get('files', [])

    if stream_type == 'clean':
        base_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'clean_stream')
    else:
        base_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream')

    deleted = []
    errors  = []

    for filename in files:
        if os.path.splitext(filename)[1].lower() != '.ts':
            continue
        if '/' in filename or '\\' in filename or '..' in filename:
            continue
        file_path = os.path.join(base_dir, filename)
        try:
            os.remove(file_path)
            deleted.append(filename)
        except FileNotFoundError:
            deleted.append(filename)
        except OSError as e:
            errors.append({'file': filename, 'error': str(e)})

    return JsonResponse({'deleted': deleted, 'errors': errors})


def list_stream_segments(request, stream_type='overlay'):
    """
    GET /parking-allotment/api/stream/list/
    GET /parking-allotment/api/stream/list-clean/
    """
    api_key = request.headers.get('X-API-KEY')
    if api_key != settings.UPLOAD_API_KEY:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if stream_type == 'clean':
        stream_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream', 'clean_stream')
    else:
        stream_dir = os.path.join(settings.MEDIA_ROOT, 'video_stream')

    if not os.path.exists(stream_dir):
        return JsonResponse({'files': []})

    files = [f for f in os.listdir(stream_dir) if f.endswith('.ts')]
    return JsonResponse({'files': files})