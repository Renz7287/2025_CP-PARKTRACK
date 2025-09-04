from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.core.exceptions import ValidationError
from .models import City, Barangay, VehicleType, VehicleBrand, VehicleModel, User, DriverProfile, Vehicle

class RegistrationStyleMixin:
    default_classes = 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
    
    def apply_styles(self):

        for field in self.fields.values():
            existing_classes = field.widget.attrs.get('class', '')
            field.widget.attrs['class'] = f'{existing_classes} {self.default_classes}'.strip()

class ModalStyleMixin:
    default_classes = 'w-full p-3 border rounded-lg mb-4 focus:ring-2 focus:ring-[#7cd1f9] outline-none'
    
    def apply_styles(self):

        for field in self.fields.values():
            existing_classes = field.widget.attrs.get('class', '')
            field.widget.attrs['class'] = f'{existing_classes} {self.default_classes}'.strip()

class BaseUserForm(UserCreationForm):
    email = forms.EmailField(required=True)
    
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('first_name', 'middle_name', 'last_name', 'email', 'password1', 'password2')
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.fields['email'].widget.attrs.pop('autofocus', None)
    
class BaseDriverProfileForm(forms.ModelForm):
    city = forms.CharField(
        widget=forms.TextInput(
            attrs={
                'id': 'city-dropdown', 'list': 'city-list', 'autocomplete': 'off'
            }
        )
    )
    barangay = forms.CharField(
        widget=forms.TextInput(
            attrs={
                'id': 'barangay-dropdown','list': 'barangay-list', 'autocomplete': 'off'
            }
        )
    )

    class Meta:
        model = DriverProfile
        fields = ('contact_number', 'gender', 'city', 'barangay')

    def clean_city(self):
        city_name = self.cleaned_data['city']

        city = City.objects.filter(citymunDesc=city_name).first()

        if not city:
            raise ValidationError("Invalid city selected.")
        
        return city
    
    def clean_barangay(self):
        barangay_name = self.cleaned_data['barangay']
        city = self.cleaned_data.get('city')

        barangay = Barangay.objects.filter(brgyDesc=barangay_name, citymunCode=city.citymunCode).first()

        if not barangay:
            raise ValidationError("Invalid barangay selected.")

        return barangay

class BaseVehicleForm(forms.ModelForm):
    vehicle_type = forms.ModelChoiceField(
        queryset = VehicleType.objects.all(),
        empty_label = 'Select Vehicle Type',
        widget = forms.Select(
            attrs={
                'id': 'vehicle-type-dropdown'
            }
        )
    )
    brand = forms.CharField(
        widget = forms.TextInput(  
            attrs={
                'id': 'brand-dropdown', 'list': 'brand-list', 'autocomplete': 'off'
            }
        )
    )
    model = forms.CharField(
        widget = forms.TextInput(  
            attrs={
                'id': 'model-dropdown', 'list': 'model-list', 'autocomplete': 'off'
            }
        )
    )

    class Meta:
        model = Vehicle
        exclude = ['brand', 'model']
        fields = ('vehicle_type', 'brand', 'model', 'color', 'plate_number', 'gate_pass')

    def clean_vehicle_type(self):
        vehicle_type_name = self.cleaned_data['vehicle_type']

        vehicle_type = VehicleType.objects.filter(type_name=vehicle_type_name).first()

        return vehicle_type
    
    def clean_brand(self):
        brand_name = self.cleaned_data['brand']
        
        return brand_name
    
    def clean_model(self):
        model_name = self.cleaned_data['model']
        
        return model_name
    
    def save(self, commit=True):
        instance = super().save(commit=False)

        vehicle_type = self.cleaned_data.get('vehicle_type')
        brand_name = self.cleaned_data['brand']
        model_name = self.cleaned_data['model']

        brand, _ = VehicleBrand.objects.get_or_create(
            brand_name = brand_name,
            type_code = vehicle_type.id
        )

        model, _ = VehicleModel.objects.get_or_create(
            model_name = model_name,
            brand_code = brand.id
        )

        instance.brand = brand
        instance.model = model

        if commit:
            instance.save()

        return instance
    
class UserRegistrationForm(RegistrationStyleMixin, BaseUserForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()

class DriverProfileRegistrationForm(RegistrationStyleMixin, BaseDriverProfileForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()

class VehicleRegistrationForm(RegistrationStyleMixin, BaseVehicleForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()

class UserModalForm(ModalStyleMixin, BaseUserForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()

class DriverProfileModalForm(ModalStyleMixin, BaseDriverProfileForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()

class VehicleModalForm(ModalStyleMixin, BaseVehicleForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()