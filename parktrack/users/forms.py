from django import forms
from django.contrib.auth.forms import UserCreationForm, PasswordChangeForm
from django.core.exceptions import ValidationError
from .models import City, Barangay, VehicleBrand, VehicleModel, User, DriverProfile, Vehicle

class RegistrationStyleMixin:
    default_classes = 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
    
    def apply_styles(self):

        for field in self.fields.values():
            existing_classes = field.widget.attrs.get('class', '')
            field.widget.attrs['class'] = f'{existing_classes} {self.default_classes}'.strip()

class ModalStyleMixin:
    default_classes = 'w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500'
    
    def apply_styles(self):

        for field in self.fields.values():
            existing_classes = field.widget.attrs.get('class', '')
            field.widget.attrs['class'] = f'{existing_classes} {self.default_classes}'.strip()

class ProfileEditStyleMixin:
    default_classes = 'w-full bg-transparent border border-gray-300 rounded-md focus:ring-0 p-2 editable-field'

    def apply_styles(self):

        for field in self.fields.values():
            existing_classes = field.widget.attrs.get('class', '')
            field.widget.attrs['class'] = f'{existing_classes} {self.default_classes}'.strip()

class UserValidationMixin:
    def clean_first_name(self):
        first_name = (self.cleaned_data.get('first_name') or '').strip()

        if len(first_name) < 2:
            raise forms.ValidationError('First name must be atleast 2 characters')
        
        if not all(char.isalpha() or char.isspace() or char == '-' for char in first_name):
            raise forms.ValidationError('First name should only contain letters, spaces, or hypens.')
        
        return first_name
    
    def clean_middle_name(self):
        middle_name = (self.cleaned_data.get('middle_name') or '').strip()

        if not all(char.isalpha() or char.isspace() or char == '-' for char in middle_name):
            raise forms.ValidationError('Middle name should only contain letters, spaces, or hypens.')
        
        return middle_name
    
    def clean_last_name(self):
        last_name = (self.cleaned_data.get('last_name') or '').strip()

        if len(last_name) < 2:
            raise forms.ValidationError('Last name must be atleast 2 characters.')
        
        if not all(char.isalpha() or char.isspace() or char == '-' for char in last_name):
            raise forms.ValidationError('Last name should only contain letters, spaces, or hypens.')
        
        return last_name
        
    def clean_email(self):
        email = (self.cleaned_data.get('email') or '').strip().lower()

        if User.objects.filter(email = email).exclude(pk=self.instance.pk).exists():
            raise forms.ValidationError('This email address is already in use.')
        
        return email

class BaseUserForm(UserCreationForm, UserValidationMixin):
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

    def clean_contact_number(self):
        contact_number = (self.cleaned_data.get('contact_number') or '').strip()

        if not contact_number.isdigit() or len(contact_number) != 11:
            raise forms.ValidationError('Contact number must be exactly 11 digits.')
        
        return contact_number

    def clean_city(self):
        city_name = self.cleaned_data['city']

        city = City.objects.filter(citymunDesc=city_name).first()

        if not city:
            raise ValidationError("Invalid city selected. Please choose from the given options.")
        
        return city
    
    def clean_barangay(self):
        barangay_name = self.cleaned_data['barangay']
        city_name = self.cleaned_data.get('city')

        if city_name:
            city = City.objects.filter(citymunDesc=city_name).first()
            
            if city:
                barangay = Barangay.objects.filter(brgyDesc=barangay_name, citymunCode=city.citymunCode).first()

                if not barangay:
                    raise ValidationError("Invalid barangay selected. Barangay must belong to the selected city.")

        return barangay

class BaseVehicleForm(forms.ModelForm):
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
        fields = ('brand', 'model', 'color', 'plate_number')

    def clean_brand(self):
        brand_name = self.cleaned_data['brand']

        return brand_name
    
    def clean_model(self):
        model_name = self.cleaned_data['model']
        
        return model_name
    
    def clean_color(self):
        color = (self.cleaned_data.get('color') or '').strip()

        if not all(char.isalpha() or char.isspace() for char in color):
            raise forms.ValidationError('Color should only contain letters or spaces.')
        
        return color

    def clean_plate_number(self):
        plate_number = (self.cleaned_data.get('plate_number') or '').strip()

        if not all(char.isalpha() or char.isdigit() or char in ['-', ' '] for char in plate_number):
            raise forms.ValidationError('Plate number should only contain letters, numbers, spaces, or hypens.')
        
        if Vehicle.objects.filter(plate_number=plate_number).exclude(pk=self.instance.pk).exists():
            raise forms.ValidationError('This plate number is already registered.')
        
        return plate_number
    
    def save(self, commit=True):
        instance = super().save(commit=False)

        brand_name = self.cleaned_data['brand']
        model_name = self.cleaned_data['model']

        brand, _ = VehicleBrand.objects.get_or_create(
            brand_name = brand_name,
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
    
class ChangePasswordForm(PasswordChangeForm, ProfileEditStyleMixin):
    class Meta:
        model = User
        fields = ('old_password', 'new_password1', 'new_password2')

    def __init__(self, *args, **kwargs):
        user = kwargs.pop('user')

        super().__init__(user=user, *args, **kwargs)
        self.apply_styles()
    
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

class UserEditForm(ProfileEditStyleMixin, forms.ModelForm, UserValidationMixin):
    profile_picture = forms.FileField(
        widget=forms.FileInput(
            attrs={
                'id': 'profile-picture-input', 'class': 'hidden editable-field', 'accept': 'image/*'
            },
        ),
        required=False
    )

    class Meta:
        model = User
        fields = ('first_name', 'middle_name', 'last_name', 'email', 'profile_picture')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()

class DriverProfileEditForm(ProfileEditStyleMixin, BaseDriverProfileForm):
    class Meta:
        model = DriverProfile
        exclude = ['user', 'gender']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.apply_styles()

        instance = kwargs.get('instance')

        if instance:
            self._city_obj = instance.city
            self._barangay_obj = instance.barangay

            if instance.city:
                self.initial['city'] = instance.city.citymunDesc

            if instance.barangay:
                self.initial['barangay'] = instance.barangay.brgyDesc

class VehicleModalForm(ModalStyleMixin, BaseVehicleForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.apply_styles()