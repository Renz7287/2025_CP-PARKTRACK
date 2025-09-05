from django.db import transaction
from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from users.models import DriverProfile, City
from users.forms import UserModalForm, DriverProfileModalForm

# Create your views here.

@login_required
def personal_information(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    driver_profile = DriverProfile.objects.filter(user=pk).first()
    vehicles = driver_profile.vehicles.all() if driver_profile else []

    user = request.user

    user_form = UserModalForm(instance=user)
    driver_profile_form = DriverProfileModalForm(instance=user.driver_profile) if driver_profile else None

    cities = City.objects.all()

    context = {
        'is_partial': is_ajax,
        'driver_profile': driver_profile,
        'vehicles': vehicles,
        'user_form': user_form,
        'driver_profile_form': driver_profile_form,
        'cities': cities
    }
    return render(request, 'settings/index.html', context)

@login_required
def vehicle_management(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    context = {
        'is_partial': is_ajax
    }
    return render(request, 'settings/vehicle-management.html', context)

@login_required
def edit_user(request):
    user = request.user

    if request.method == 'POST':
        user_form = UserModalForm(request.POST, request.FILES, instance=user)
        driver_profile_form = DriverProfileModalForm(request.POST,  instance=user.driver_profile)

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