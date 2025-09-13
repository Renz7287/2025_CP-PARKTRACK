from django.db import transaction
from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from users.models import City, VehicleBrand, User, DriverProfile, Vehicle
from users.forms import UserEditForm, DriverProfileEditForm, VehicleModalForm

# Create your views here.

@login_required
def personal_information(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    user = User.objects.get(id=pk)
    driver_profile = DriverProfile.objects.filter(user=user).first()

    user_form = UserEditForm(instance=user)
    driver_profile_form = DriverProfileEditForm(instance=user.driver_profile) if driver_profile else None

    cities = City.objects.all()

    context = {
        'is_partial': is_ajax,
        'driver_profile': driver_profile,
        'user_form': user_form,
        'driver_profile_form': driver_profile_form,
        'cities': cities
    }
    return render(request, 'settings/index.html', context)

@login_required
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

@login_required
def edit_user(request, pk):
    user = User.objects.get(id=pk)

    if request.method == 'POST':
        user_form = UserEditForm(request.POST, request.FILES, instance=user)
        driver_profile_form = DriverProfileEditForm(request.POST,  instance=user.driver_profile)

        if user_form.is_valid() and driver_profile_form.is_valid():
            
            with transaction.atomic():
                user_form.save()
                driver_profile_form.save()

            messages.success(request, 'Personal information updated successfully!')
            return JsonResponse({'success': True})
        
        errors = {}

        for form in [user_form, driver_profile_form]:

            for field, field_errors in form.errors.items():
                errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})

    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})

@login_required
def add_vehicle(request):
    user = request.user
    
    if request.method == 'POST':
        form = VehicleModalForm(request.POST)

        if form.is_valid():
            vehicle = form.save(commit=False)
            vehicle.owner = DriverProfile.objects.get(user=user)
            vehicle.save()

            messages.success(request, 'Vehicle added successfully!')

            return JsonResponse({'success': True})
        
        errors = {}

        for field, field_errors in form.errors.items():
            errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})
    
    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid request']}})

@login_required
def edit_vehicle(request, pk):
    vehicle = Vehicle.objects.get(id=pk)

    if request.method == 'POST':
        form = VehicleModalForm(request.POST, instance=vehicle)

        if form.is_valid():
            form.save()
            messages.success(request, 'Vehicle information updated successfully!')

            return JsonResponse({'success': True})
        
        errors = {}

        for field, field_errors in form.errors.items():
            errors[field] = field_errors

        return JsonResponse({'success': False, 'errors': errors})
    
    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})

@login_required
def delete_vehicle(request, pk):
    if request.method == 'POST':
        try:
            vehicle = Vehicle.objects.get(id=pk)
            vehicle.delete()

            return JsonResponse({'success': True})
        except Vehicle.DoesNotExist:
            return JsonResponse({'success': False, 'errors': 'Vehicle not found'})
    
    return JsonResponse({'success': False, 'errors': {'__all__': ['Invalid Request']}})