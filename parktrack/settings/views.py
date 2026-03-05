import json, os
import urllib.request
from django.db import transaction
from django.shortcuts import render, get_object_or_404
from django.conf import settings as django_settings
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from users.models import City, VehicleBrand, User, DriverProfile, Vehicle
from users.forms import UserEditForm, DriverProfileEditForm, VehicleModalForm, ChangePasswordForm
from utils.decorators import group_required
from .models import Camera, ParkingSlot


@group_required('Admin', 'Driver')
def personal_information(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    # Use get_object_or_404 to avoid unhandled DoesNotExist on User
    user = get_object_or_404(User, id=pk)

    # Safely get driver_profile — avoids RelatedObjectDoesNotExist crash
    driver_profile = getattr(user, 'driver_profile', None)

    user_form = UserEditForm(instance=user)

    # Only instantiate the driver profile form if the profile actually exists
    driver_profile_form = DriverProfileEditForm(instance=driver_profile) if driver_profile else None

    change_password_form = ChangePasswordForm(user=user)

    cities = City.objects.all()

    context = {
        'is_partial': is_ajax,
        'driver_profile': driver_profile,
        'user_form': user_form,
        'driver_profile_form': driver_profile_form,
        'change_password_form': change_password_form,
        'cities': cities,
    }
    return render(request, 'settings/index.html', context)


@group_required('Admin', 'Driver')
def edit_user(request, pk):
    user = get_object_or_404(User, id=pk)

    if request.method == 'POST':
        # Safely get driver_profile
        driver_profile = getattr(user, 'driver_profile', None)

        user_form = UserEditForm(request.POST, request.FILES, instance=user)
        driver_profile_form = DriverProfileEditForm(request.POST, instance=driver_profile) if driver_profile else None

        forms_valid = user_form.is_valid() and (driver_profile_form.is_valid() if driver_profile_form else True)

        if forms_valid:
            with transaction.atomic():
                user_form.save()
                if driver_profile_form:
                    driver_profile_form.save()

            html = render(
                request, 'components/personal-information.html',
                {
                    'driver_profile': getattr(request.user, 'driver_profile', None),
                    'user_form': user_form,
                    'driver_profile_form': driver_profile_form,
                    'cities': City.objects.all(),
                },
            ).content.decode('utf-8')

            return JsonResponse({'success': True, 'html': html, 'message': 'Personal information updated successfully!'})

        errors = {}
        for form in filter(None, [user_form, driver_profile_form]):
            for field, field_errors in form.errors.items():
                errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})

    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})


@group_required('Admin', 'Driver')
def change_password(request, pk):
    user = get_object_or_404(User, id=pk)

    if request.method == 'POST':
        form = ChangePasswordForm(data=request.POST, user=user)

        if form.is_valid():
            form.save()
            update_session_auth_hash(request, user)

            html = render(request, 'components/change-password.html',
                {'change_password_form': form}
            ).content.decode('utf-8')

            return JsonResponse({'success': True, 'html': html, 'message': 'Password updated successfully!'})

        errors = {}
        for field, field_errors in form.errors.items():
            errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})

    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid request']}})


@group_required('Driver')
def vehicle_management(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    owner = get_object_or_404(DriverProfile, user=pk)
    vehicles = owner.vehicles.all()

    form = VehicleModalForm()
    brands = list(VehicleBrand.objects.all().values('id', 'brand_name'))

    context = {
        'is_partial': is_ajax,
        'vehicles': vehicles,
        'form': form,
        'brands': brands,
    }
    return render(request, 'settings/vehicle-management.html', context)


@group_required('Admin')
def parking_slot_management(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'settings/parking-slot-management.html', context)


@group_required('Driver')
def add_vehicle(request):
    user = request.user

    if request.method == 'POST':
        form = VehicleModalForm(request.POST, request.FILES)

        if form.is_valid():
            vehicle = form.save(commit=False)
            vehicle.owner = get_object_or_404(DriverProfile, user=user)
            vehicle.save()

            html = render(request, 'components/vehicles-table.html',
                {
                    'owner': get_object_or_404(DriverProfile, user=user),
                    'vehicles': Vehicle.objects.filter(owner__user=user),
                    'form': form,
                    'brands': list(VehicleBrand.objects.all().values('id', 'brand_name')),
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
    vehicle = get_object_or_404(Vehicle, id=pk)

    if request.method == 'POST':
        form = VehicleModalForm(request.POST, request.FILES, instance=vehicle)

        if form.is_valid():
            form.save()

            html = render(request, 'components/vehicles-table.html',
                {
                    'owner': get_object_or_404(DriverProfile, user=request.user),
                    'vehicles': Vehicle.objects.filter(owner__user=request.user),
                    'form': form,
                    'brands': list(VehicleBrand.objects.all().values('id', 'brand_name')),
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
            vehicle = get_object_or_404(Vehicle, id=pk)
            vehicle.delete()
            return JsonResponse({'success': True})
        except Exception:
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
        'slots': [slot.to_dict() for slot in slots],
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

    new_label = data.get('slot_label', '').strip()
    if new_label and new_label != slot.slot_label:
        if ParkingSlot.objects.filter(camera=slot.camera, slot_label=new_label).exclude(id=pk).exists():
            return JsonResponse({'success': False, 'error': f'Slot label "{new_label}" already exists for this camera.'}, status=400)
        slot.slot_label = new_label

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

    camera_id  = data.get('camera_id')
    slots_data = data.get('slots', [])

    if not camera_id:
        return JsonResponse({'success': False, 'error': 'camera_id is required.'}, status=400)

    if not isinstance(slots_data, list):
        return JsonResponse({'success': False, 'error': 'slots must be a list.'}, status=400)

    try:
        camera = Camera.objects.get(id=camera_id, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

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

    with transaction.atomic():
        ParkingSlot.objects.filter(camera=camera).update(is_active=False)

        saved_slots = []
        for slot_data in slots_data:
            label  = slot_data['slot_label'].strip()
            points = slot_data['polygon_points']

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
    stream_url = data.get('stream_url', '').strip()

    if not name:
        return JsonResponse({'success': False, 'error': 'Camera name is required.'}, status=400)

    if Camera.objects.filter(name=name, is_active=True).exclude(id=pk).exists():
        return JsonResponse({'success': False, 'error': f'A camera named "{name}" already exists.'}, status=400)

    camera.name       = name
    camera.location   = location
    camera.stream_url = stream_url
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
        return JsonResponse({'error': 'Camera not found.'}, status=404)

    snapshot_file = request.FILES.get('snapshot')
    if not snapshot_file:
        return JsonResponse({'error': 'No file was uploaded.'}, status=400)

    allowed_types = ['image/jpeg', 'image/png', 'image/webp']
    if snapshot_file.content_type not in allowed_types:
        return JsonResponse(
            {'error': 'Invalid file type. Please upload a JPEG, PNG, or WEBP image.'},
            status=400,
        )

    max_size = 10 * 1024 * 1024
    if snapshot_file.size > max_size:
        return JsonResponse({'error': 'File too large. Maximum size is 10 MB.'}, status=400)

    # Save to clean_snapshots with timestamp so api_clean_snapshot picks it up
    clean_dir = os.path.join(django_settings.MEDIA_ROOT, 'video_stream', 'clean_snapshots')
    os.makedirs(clean_dir, exist_ok=True)

    import time
    filename  = f'snapshot_{int(time.time())}.jpg'
    save_path = os.path.join(clean_dir, filename)

    with open(save_path, 'wb') as f:
        for chunk in snapshot_file.chunks():
            f.write(chunk)

    media_url           = f'{django_settings.MEDIA_URL}video_stream/clean_snapshots/{filename}'
    camera.snapshot_url = media_url
    camera.save()

    return JsonResponse({
        'success':      True,
        'message':      'Snapshot uploaded successfully.',
        'snapshot_url': media_url,
        'camera':       camera.to_dict(),
    })


@group_required('Admin')
@require_http_methods(['GET'])
def api_get_clean_stream(request, pk):
    try:
        Camera.objects.get(id=pk, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Camera not found.'}, status=404)

    hls_path = os.path.join(django_settings.MEDIA_ROOT, 'video_stream', 'clean_stream', 'stream.m3u8')
    if not os.path.exists(hls_path):
        return JsonResponse(
            {'success': False, 'error': 'Clean stream not available. Is the Pi running?'},
            status=404,
        )

    stream_url = '/parking-allotment/stream/clean_stream/stream.m3u8'
    return JsonResponse({'success': True, 'stream_url': stream_url})


@group_required('Admin')
@require_http_methods(['POST'])
def api_capture_snapshot_from_frame(request, pk):
    try:
        camera = Camera.objects.get(id=pk, is_active=True)
    except Camera.DoesNotExist:
        return JsonResponse({'error': 'Camera not found.'}, status=404)

    frame_file = request.FILES.get('snapshot')
    if not frame_file:
        return JsonResponse({'error': 'No frame data received.'}, status=400)

    clean_dir = os.path.join(django_settings.MEDIA_ROOT, 'video_stream', 'clean_snapshots')
    os.makedirs(clean_dir, exist_ok=True)

    import time
    filename  = f'snapshot_{int(time.time())}.jpg'
    save_path = os.path.join(clean_dir, filename)

    with open(save_path, 'wb') as f:
        for chunk in frame_file.chunks():
            f.write(chunk)

    media_url = f'{django_settings.MEDIA_URL}video_stream/clean_snapshots/{filename}'
    camera.snapshot_url = media_url
    camera.save()

    return JsonResponse({
        'success':      True,
        'message':      'Snapshot saved.',
        'snapshot_url': media_url,
        'camera':       camera.to_dict(),
    })