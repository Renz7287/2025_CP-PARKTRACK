from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from users.models import DriverProfile
from users.forms import UserModalForm, DriverProfileModalForm

# Create your views here.

@login_required
def account_settings(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    driver_profile = DriverProfile.objects.filter(user=pk).first()
    vehicles = driver_profile.vehicles.all() if driver_profile else []

    user = request.user

    user_form = UserModalForm(instance=user)
    driver_profile_form = DriverProfileModalForm(instance=user.driver_profile) if driver_profile else None


    context = {
        'is_partial': is_ajax,
        'driver_profile': driver_profile,
        'vehicles': vehicles,
        'user_form': user_form,
        'driver_profile_form': driver_profile_form
    }
    return render(request, 'settings/index.html', context)

@login_required
def vehicle_management(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    context = {
        'is_partial': is_ajax
    }
    return render(request, 'settings/vehicle-management.html', context)