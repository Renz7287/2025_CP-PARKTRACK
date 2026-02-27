import json, os
import urllib.request
from django.db import transaction
from django.shortcuts import render
from django.conf import settings as django_settings
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from users.models import City, VehicleBrand, User, DriverProfile, Vehicle
from users.forms import UserEditForm, DriverProfileEditForm, VehicleModalForm, ChangePasswordForm
from utils.decorators import group_required
from utils.decorators import group_required
from .models import Camera, ParkingSlot

# Create your views here.

@group_required('Admin', 'Driver')
def personal_information(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    user = User.objects.get(id=pk)
    driver_profile = DriverProfile.objects.filter(user=user).first()

    user_form = UserEditForm(instance=user)
    driver_profile_form = DriverProfileEditForm(instance=user.driver_profile) if driver_profile else None
    change_password_form = ChangePasswordForm(user=user)

    cities = City.objects.all()

    context = {
        'is_partial': is_ajax,
        'driver_profile': driver_profile,
        'user_form': user_form,
        'driver_profile_form': driver_profile_form,
        'change_password_form': change_password_form,
        'cities': cities
    }
    return render(request, 'settings/index.html', context)

@group_required('Driver')
def vehicle_management(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    owner = DriverProfile.objects.get(user=pk)
    vehicles = owner.vehicles.all()

    form = VehicleModalForm()

    brands = list(VehicleBrand.objects.all().values('id', 'brand_name'))

    context = {
        'is_partial': is_ajax,
        'vehicles': vehicles,
        'form': form,
        'brands': brands
    }
    return render(request, 'settings/vehicle-management.html', context)

@group_required('Admin')
def parking_slot_management(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    context = {
        'is_partial': is_ajax
    }
    return render(request, 'settings/parking-slot-management.html', context)

@group_required('Admin', 'Driver')
def edit_user(request, pk):
    user = User.objects.get(id=pk)

    if request.method == 'POST':
        user_form = UserEditForm(request.POST, request.FILES, instance=user)
        driver_profile_form = DriverProfileEditForm(request.POST,  instance=user.driver_profile)

        if user_form.is_valid() and driver_profile_form.is_valid():
            
            with transaction.atomic():
                user_form.save()
                driver_profile_form.save()

            html = render(
                request, 'components/personal-information.html',
                {
                    'driver_profile': request.user.driver_profile,
                    'user_form': user_form,
                    'driver_profile_form': driver_profile_form,
                    'cities': City.objects.all()
                },
            ).content.decode('utf-8')

            return JsonResponse({'success': True, 'html': html, 'message': 'Personal information updated successfully!'})
        
        errors = {}

        for form in [user_form, driver_profile_form]:

            for field, field_errors in form.errors.items():
                errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})

    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})

@group_required('Admin', 'Driver')
def change_password(request, pk):
    user = User.objects.get(id=pk)

    if request.method == 'POST':
        form = ChangePasswordForm(data=request.POST, user=user)

        if form.is_valid():
            form.save()

            update_session_auth_hash(request, user)

            html = render(request, 'components/change-password.html',
                {
                    'change_password_form': form
                }
            ).content.decode('utf-8')

            return JsonResponse({'success': True, 'html': html, 'message': 'Password updated successfully!'})

        errors = {}

        for field, field_errors in form.errors.items():
            errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})

    return JsonResponse({'success': False, 'erros': {'__all__': ['Invalid request']}})

@group_required('Driver')
def add_vehicle(request):
    user = request.user
    
    if request.method == 'POST':
        form = VehicleModalForm(request.POST, request.FILES)

        if form.is_valid():
            vehicle = form.save(commit=False)
            vehicle.owner = DriverProfile.objects.get(user=user)
            vehicle.save()

            html = render(request, 'components/vehicles-table.html',
                {
                    'owner': DriverProfile.objects.get(user=user),
                    'vehicles': Vehicle.objects.filter(owner__user=user),
                    'form': form,
                    'brands': list(VehicleBrand.objects.all().values('id', 'brand_name'))
                }
            ).content.decode('utf-8')
            
            return JsonResponse({'success': True, 'html': html, 'message': 'Vehicle added successfully!'})
        
        errors = {}

        for field, field_errors in form.errors.items():
            errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})
    
    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid request']}})

@group_required('Driver')
def edit_vehicle(request, pk):
    vehicle = Vehicle.objects.get(id=pk)

    if request.method == 'POST':
        form = VehicleModalForm(request.POST, request.FILES, instance=vehicle)

        if form.is_valid():
            form.save()
            
            html = render(request, 'components/vehicles-table.html',
                {
                    'owner': DriverProfile.objects.get(user=request.user),
                    'vehicles': Vehicle.objects.filter(owner__user=request.user),
                    'form': form,
                    'brands': list(VehicleBrand.objects.all().values('id', 'brand_name'))
                }
            ).content.decode('utf-8')
            
            return JsonResponse({'success': True, 'html': html, 'message': 'Vehicle information updated successfully!'})
        
        errors = {}

        for field, field_errors in form.errors.items():
            errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})
    
    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})

@group_required('Driver')
def delete_vehicle(request, pk):
    if request.method == 'POST':
        try:
            vehicle = Vehicle.objects.get(id=pk)
            vehicle.delete()

            return JsonResponse({'success': True})
        except Vehicle.DoesNotExist:
            return JsonResponse({'success': False, 'errors': 'Vehicle not found'})
    
    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})

@require_http_methods(['GET'])
def api_get_slots(request):
    camera_id = request.GET.get('camera_id')

    if not camera_id:
        return JsonResponse({'success': False, 'error': 'camera_id is required.'}, status=400)

    try:
        camera = Camera.objects.get(id=camera_id, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    slots = ParkingSlot.objects.filter(camera=camera, is_active=True)

    return JsonResponse({
        'success': True,
        'slots': [slot.to_dict() for slot in slots]
    })

@group_required('Admin')
@require_http_methods(['POST'])
def api_add_slot(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON body.'}, status=400)

    camera_id      = data.get('camera_id')
    slot_label     = data.get('slot_label', '').strip()
    polygon_points = data.get('polygon_points', [])

    # Validation────────────────
    if not camera_id:
        return JsonResponse({'success': False, 'error': 'camera_id is required.'}, status=400)

    if not slot_label:
        return JsonResponse({'success': False, 'error': 'slot_label is required.'}, status=400)

    if not isinstance(polygon_points, list) or len(polygon_points) < 3:
        return JsonResponse({'success': False, 'error': 'polygon_points must be a list with at least 3 points.'}, status=400)

    for point in polygon_points:
        if not isinstance(point, list) or len(point) != 2:
            return JsonResponse({'success': False, 'error': 'Each point must be a list of [x, y].'}, status=400)
        x, y = point
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            return JsonResponse({'success': False, 'error': 'Polygon coordinates must be normalized between 0.0 and 1.0.'}, status=400)

    try:
        camera = Camera.objects.get(id=camera_id, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    if ParkingSlot.objects.filter(camera=camera, slot_label=slot_label).exists():
        return JsonResponse({'success': False, 'error': f'Slot label "{slot_label}" already exists for this camera.'}, status=400)

    slot = ParkingSlot.objects.create(
        camera=camera,
        slot_label=slot_label,
        polygon_points=polygon_points,
    )

    return JsonResponse({'success': True, 'message': f'Slot {slot_label} added successfully.', 'slot': slot.to_dict()}, status=201)

@group_required('Admin')
@require_http_methods(['POST'])
def api_update_slot(request, pk):
    try:
        slot = ParkingSlot.objects.get(id=pk)
    except ParkingSlot.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Parking slot not found.'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON body.'}, status=400)

    # Optional field: slot_label
    new_label = data.get('slot_label', '').strip()
    if new_label and new_label != slot.slot_label:
        if ParkingSlot.objects.filter(camera=slot.camera, slot_label=new_label).exclude(id=pk).exists():
            return JsonResponse({'success': False, 'error': f'Slot label "{new_label}" already exists for this camera.'}, status=400)
        slot.slot_label = new_label

    # Optional field: polygon_points
    polygon_points = data.get('polygon_points')
    if polygon_points is not None:
        if not isinstance(polygon_points, list) or len(polygon_points) < 3:
            return JsonResponse({'success': False, 'error': 'polygon_points must be a list with at least 3 points.'}, status=400)

        for point in polygon_points:
            if not isinstance(point, list) or len(point) != 2:
                return JsonResponse({'success': False, 'error': 'Each point must be a list of [x, y].'}, status=400)
            x, y = point
            if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
                return JsonResponse({'success': False, 'error': 'Polygon coordinates must be normalized between 0.0 and 1.0.'}, status=400)

        slot.polygon_points = polygon_points

    slot.save()

    return JsonResponse({'success': True, 'message': f'Slot {slot.slot_label} updated successfully.', 'slot': slot.to_dict()})


@group_required('Admin')
@require_http_methods(['POST'])
def api_delete_slot(request, pk):
    try:
        slot = ParkingSlot.objects.get(id=pk)
    except ParkingSlot.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Parking slot not found.'}, status=404)

    slot_label = slot.slot_label
    slot.is_active = False
    slot.save()

    return JsonResponse({'success': True, 'message': f'Slot {slot_label} deleted successfully.'})

@group_required('Admin')
@require_http_methods(['POST'])
def api_bulk_save_slots(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON body.'}, status=400)

    camera_id = data.get('camera_id')
    slots_data = data.get('slots', [])

    if not camera_id:
        return JsonResponse({'success': False, 'error': 'camera_id is required.'}, status=400)

    if not isinstance(slots_data, list):
        return JsonResponse({'success': False, 'error': 'slots must be a list.'}, status=400)

    try:
        camera = Camera.objects.get(id=camera_id, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    # Validate all slots before touching the DB
    seen_labels = set()
    for i, slot_data in enumerate(slots_data):
        label  = slot_data.get('slot_label', '').strip()
        points = slot_data.get('polygon_points', [])

        if not label:
            return JsonResponse({'success': False, 'error': f'Slot at index {i} is missing a slot_label.'}, status=400)

        if label in seen_labels:
            return JsonResponse({'success': False, 'error': f'Duplicate slot_label "{label}" found in the submitted data.'}, status=400)

        seen_labels.add(label)

        if not isinstance(points, list) or len(points) < 3:
            return JsonResponse({'success': False, 'error': f'Slot "{label}" must have at least 3 polygon points.'}, status=400)

        for point in points:
            if not isinstance(point, list) or len(point) != 2:
                return JsonResponse({'success': False, 'error': f'Slot "{label}" has an invalid point format. Expected [x, y].'}, status=400)
            x, y = point
            if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
                return JsonResponse({'success': False, 'error': f'Slot "{label}" has coordinates outside the 0.0–1.0 range.'}, status=400)

    # Wipe old slots, insert new ones
    with transaction.atomic():
        # Soft-delete all existing slots for this camera
        ParkingSlot.objects.filter(camera=camera).update(is_active=False)

        saved_slots = []
        for slot_data in slots_data:
            label  = slot_data['slot_label'].strip()
            points = slot_data['polygon_points']

            # Reactivate if a slot with this label existed before, else create new
            slot, created = ParkingSlot.objects.update_or_create(
                camera=camera,
                slot_label=label,
                defaults={
                    'polygon_points': points,
                    'is_active': True,
                    'status': 'available',
                }
            )
            saved_slots.append(slot.to_dict())

    return JsonResponse({'success': True, 'message': f'{len(saved_slots)} slot(s) saved successfully.', 'slots': saved_slots})

@group_required('Admin')
@require_http_methods(['GET'])
def api_get_camera(request):
    """Returns the single active camera record."""
    try:
        camera = Camera.objects.filter(is_active=True).first()
        if not camera:
            return JsonResponse({'success': False, 'error': 'No camera found. Run migrations to seed the default camera.'}, status=404)
        return JsonResponse({'success': True, 'camera': camera.to_dict()})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

@group_required('Admin')
@require_http_methods(['POST'])
def api_edit_camera(request, pk):
    try:
        camera = Camera.objects.get(id=pk, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON.'}, status=400)

    name       = data.get('name', '').strip()
    location   = data.get('location', '').strip()
    stream_url = data.get('stream_url', '').strip()   # ← NEW

    if not name:
        return JsonResponse({'success': False, 'error': 'Camera name is required.'}, status=400)

    if Camera.objects.filter(name=name, is_active=True).exclude(id=pk).exists():
        return JsonResponse({'success': False, 'error': f'A camera named "{name}" already exists.'}, status=400)

    camera.name       = name
    camera.location   = location
    camera.stream_url = stream_url   # ← NEW
    camera.save()

    return JsonResponse({
        'success': True,
        'message': 'Camera updated successfully.',
        'camera':  camera.to_dict(),
    })

@group_required('Admin')
@require_http_methods(['POST'])
def api_upload_snapshot(request, pk):
    try:
        camera = Camera.objects.get(id=pk, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    snapshot_file = request.FILES.get('snapshot')

    if not snapshot_file:
        return JsonResponse({'success': False, 'error': 'No file was uploaded.'}, status=400)

    allowed_types = ['image/jpeg', 'image/png', 'image/webp']
    if snapshot_file.content_type not in allowed_types:
        return JsonResponse(
            {'success': False, 'error': 'Invalid file type. Please upload a JPEG, PNG, or WEBP image.'},
            status=400,
        )

    max_size = 10 * 1024 * 1024
    if snapshot_file.size > max_size:
        return JsonResponse({'success': False, 'error': 'File too large. Maximum size is 10 MB.'}, status=400)

    ext       = os.path.splitext(snapshot_file.name)[1].lower() or '.jpg'
    filename  = f'snapshot_camera_{pk}{ext}'
    save_dir  = os.path.join(django_settings.MEDIA_ROOT, 'snapshots')
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)

    with open(save_path, 'wb') as f:
        for chunk in snapshot_file.chunks():
            f.write(chunk)

    media_url            = f'{django_settings.MEDIA_URL}snapshots/{filename}'
    camera.snapshot_url  = media_url          # ← store in snapshot_url, NOT stream_url
    camera.save()

    return JsonResponse({
        'success':      True,
        'message':      'Snapshot uploaded successfully.',
        'snapshot_url': media_url,
        'camera':       camera.to_dict(),
    })

@group_required('Admin')
@require_http_methods(['POST'])
def api_capture_snapshot(request, pk):
    """
    Captures a current frame from the camera's HLS stream using ffmpeg.
    Uses -sseof -3 to seek to near the live edge before grabbing the frame,
    ensuring we get a recent frame rather than the first (oldest) segment.
    """
    import subprocess, time

    try:
        camera = Camera.objects.get(id=pk, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    stream_url = camera.stream_url
    if not stream_url:
        return JsonResponse(
            {'success': False, 'error': 'No stream URL configured for this camera.'},
            status=400,
        )

    filename  = f'snapshot_camera_{pk}.jpg'
    save_dir  = os.path.join(django_settings.MEDIA_ROOT, 'snapshots')
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)

    # Make relative URLs absolute so ffmpeg can reach them over HTTP
    if stream_url.startswith('/'):
        host       = request.build_absolute_uri('/').rstrip('/')
        stream_url = host + stream_url

    try:
        result = subprocess.run(
            [
                'ffmpeg',
                '-y',                   # overwrite output file
                '-sseof', '-3',         # seek to 3 seconds before end → live edge
                '-i', stream_url,       # HLS playlist URL
                '-frames:v', '1',       # grab exactly one video frame
                '-q:v', '2',            # JPEG quality (2 = high)
                '-vf', 'scale=iw:ih',   # no rescaling, keep original resolution
                save_path,
            ],
            timeout=30,
            capture_output=True,
        )
        if result.returncode != 0:
            error_msg = result.stderr.decode('utf-8', errors='replace')[-500:]
            return JsonResponse(
                {'success': False, 'error': f'ffmpeg failed: {error_msg}'},
                status=502,
            )
    except FileNotFoundError:
        return JsonResponse(
            {'success': False, 'error': 'ffmpeg is not installed. Run: sudo apt install ffmpeg'},
            status=500,
        )
    except subprocess.TimeoutExpired:
        return JsonResponse(
            {'success': False, 'error': 'Timed out waiting for a frame from the stream. Is the Pi streaming?'},
            status=502,
        )

    media_url           = f'{django_settings.MEDIA_URL}snapshots/{filename}?v={int(time.time())}'
    camera.snapshot_url = media_url
    camera.save()

    return JsonResponse({
        'success':      True,
        'message':      'Snapshot captured successfully.',
        'snapshot_url': media_url,
        'camera':       camera.to_dict(),
    })