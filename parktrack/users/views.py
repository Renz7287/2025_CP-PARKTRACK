from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.views import LoginView
from django.db import transaction
from django.http import JsonResponse
from utils.decorators import unauthenticated_user
from .forms import UserRegistrationForm, DriverProfileRegistrationForm, VehicleRegistrationForm
from .models import DriverProfile, Barangay, VehicleBrand, VehicleModel

# Create your views here.

class CustomLoginView(LoginView):
    template_name = 'users/login.html'

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
    
def home(request):
    return render(request, 'users/index.html')

@unauthenticated_user
def register_user(request):
    if request.method == 'POST':
        user_form = UserRegistrationForm(request.POST, prefix='user')
        vehicle_form = VehicleRegistrationForm(request.POST, request.FILES, prefix='vehicle')

        if user_form.is_valid() and vehicle_form.is_valid():
            with transaction.atomic():
                user = user_form.save()

                driver_profile = DriverProfile.objects.create(user=user)

                vehicle = vehicle_form.save(commit=False)
                vehicle.owner = driver_profile
                vehicle.save()

            return JsonResponse({'success': True, 'message': 'You have been registered successfully.'})

        errors = {}
        for form in [user_form, vehicle_form]:
            for field, field_errors in form.errors.items():
                prefix_name = f'{form.prefix}-{field}' if form.prefix else field
                errors[prefix_name] = field_errors

        return JsonResponse({'success': False, 'errors': errors})

    else:
        user_form = UserRegistrationForm(prefix='user')
        vehicle_form = VehicleRegistrationForm(prefix='vehicle')

    brands = list(VehicleBrand.objects.all().values('id', 'brand_name'))
    context = {
        'user_form': user_form,
        'vehicle_form': vehicle_form,
        'brands': brands,
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