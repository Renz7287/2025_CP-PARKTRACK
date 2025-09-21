from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import login
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
    
    def form_valid(self, form):
        self.user = form.get_user()
        login(self.request, self.user)

        if self.request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': True, 'redirect_url': self.get_success_url()})
        return super().form_valid(form)
    
    def form_invalid(self, form):

        if self.request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'errors': form.errors, '__all__': form.non_field_errors()})
        return super().form_invalid(form)

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

            return JsonResponse({'success': True, 'message': 'You have been registered successfully.'})
        
        errors = {}

        for form in [user_form, driver_profile_form, vehicle_form]:
            for field, field_errors in form.errors.items():
                prefix_name = f'{form.prefix}-{field}' if form.prefix else field
                errors[prefix_name] = field_errors

        return JsonResponse({'success': False, 'errors': errors})
                        
    else:
        user_form = UserRegistrationForm(prefix='user')
        driver_profile_form = DriverProfileRegistrationForm(prefix='driver_profile')
        vehicle_form = VehicleRegistrationForm(prefix='vehicle')

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