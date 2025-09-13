from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.views import LoginView
from django.db import transaction
from django.http import JsonResponse
from .forms import UserRegistrationForm, DriverProfileRegistrationForm, VehicleRegistrationForm
from .models import City, Barangay, VehicleBrand, VehicleModel

# Create your views here.

class CustomLoginView(LoginView):
    template_name = 'users/index.html'

    def dispatch(self, request, *args, **kwargs):

        if request.user.is_authenticated:
            return redirect('parking_allotment:parking-allotment')
        return super().dispatch(request, *args, **kwargs)

def register_user(request):
    if request.method == 'POST':
        user_form = UserRegistrationForm(request.POST, prefix='user')
        driver_profile_form = DriverProfileRegistrationForm(request.POST, prefix='driver_profile')
        vehicle_form = VehicleRegistrationForm(request.POST, prefix='vehicle')

        if user_form.is_valid() and driver_profile_form.is_valid() and vehicle_form.is_valid():

            with transaction.atomic():
                user = user_form.save()
                driver_profile = driver_profile_form.save(commit=False)
                driver_profile.user = user
                driver_profile.save()
                vehicle = vehicle_form.save(commit=False)
                vehicle.owner = driver_profile
                vehicle.save()

            messages.success(request, 'You have been registered successfully.')
            return redirect('users:login')
        
        else:
            print('Form is not valid.')
            print(user_form.errors.as_text())
            print(driver_profile_form.errors.as_text())
            print(vehicle_form.errors.as_text())
                        
    else:
        user_form = UserRegistrationForm(request.POST, prefix='user')
        driver_profile_form = DriverProfileRegistrationForm(request.POST, prefix='driver_profile')
        vehicle_form = VehicleRegistrationForm(request.POST, prefix='vehicle')

    cities = list(City.objects.all().values('citymunDesc', 'citymunCode'))
    brands = list(VehicleBrand.objects.all().values('id', 'brand_name'))

    context = {
        'user_form': user_form,
        'driver_profile_form': driver_profile_form,
        'vehicle_form': vehicle_form,
        'cities': cities,
        'brands': brands
    }
    return render(request, 'users/register.html', context)

def get_barangays(request):
    city_code = request.GET.get('city')
    barangays = list(Barangay.objects.filter(citymunCode = city_code).values('brgyDesc', 'brgyCode'))
    return JsonResponse({'barangays': barangays})

def get_models(request):
    brand_code = request.GET.get('brand')
    models = list(VehicleModel.objects.filter(brand_code = brand_code).values('id', 'model_name'))
    return JsonResponse({'models': models })