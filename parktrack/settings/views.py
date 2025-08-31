from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from users.models import DriverProfile

# Create your views here.

@login_required
def account_settings(request, pk):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    driver_profile = DriverProfile.objects.filter(user=pk).first()
    vehicles = driver_profile.vehicles.all() if driver_profile else []

    context = {
        'is_partial': is_ajax,
        'driver_profile': driver_profile,
        'vehicles': vehicles
    }
    return render(request, 'settings/index.html', context)