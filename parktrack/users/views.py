from django.shortcuts import render, redirect
from django.db import transaction
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from .forms import UserForm, DriverProfileForm, VehicleForm
from .models import City

# Create your views here.

def login_user(request):
    if request.user.is_authenticated:
        # redirect location subject to change
        return redirect('parking-allotment:view-allotment')

    if request.method == 'POST':
        email = request.POST.get('email').lower()
        password = request.POST.get('password')

        user = authenticate(request, username = email, password = password)

        if user is not None:
            login(request, user)
            return redirect('parking-allotment:view-allotment')
        else:
            messages.error(request, 'Email OR password does not exists')
        
    return render(request, 'users/index.html')

def logout_user(request):
    logout(request)
    return redirect('users:login')

def register_user(request):
    if request.method == 'POST':
        user_form = UserForm(request.POST, prefix='user')
        driver_profile_form = DriverProfileForm(request.POST, prefix='driver_profile')
        vehicle_form = VehicleForm(request.POST, prefix='vehicle')

        if user_form.is_valid() and driver_profile_form.is_valid() and vehicle_form.is_valid():

            with transaction.atomic():
                user = user_form.save()
                driver_profile = driver_profile_form.save(commit=False)
                driver_profile.user = user
                driver_profile.save()
                vehicle = vehicle_form.save(commit=False)
                vehicle.owner = driver_profile
                vehicle.save()

            return redirect('users:login')
        
    else:
        user_form = UserForm(request.POST, prefix='user')
        driver_profile_form = DriverProfileForm(request.POST, prefix='driver_profile')
        vehicle_form = VehicleForm(request.POST, prefix='vehicle')

    cities = list(City.objects.all().values('citymunDesc', 'citymunCode'))

    context = {
        'user_form': user_form,
        'driver_profile_form': driver_profile_form,
        'vehicle_form': vehicle_form,
        'cities': cities
    }
    return render(request, 'users/register.html', context)