from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.core.exceptions import ValidationError
from .models import City, Barangay, User, DriverProfile, Vehicle

class UserForm(UserCreationForm):
    email = forms.EmailField(
        widget=forms.EmailInput(
            attrs={
                'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
            }
        ),
        required=True
    )
    password1 = forms.CharField(
        widget=forms.PasswordInput(
            attrs={
                'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
            }
        )
    )
    password2 = forms.CharField(
        widget=forms.PasswordInput(
            attrs={
                'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
            }
        )
    )
    
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('first_name', 'middle_name', 'last_name', 'email', 'password1', 'password2')
        widgets = {
            'first_name': forms.TextInput(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]',  
                }
            ),
            'middle_name': forms.TextInput(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]',
                    'placeholder': 'optional'    
                }
            ),
            'last_name': forms.TextInput(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]',
                }
            )
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.fields['email'].widget.attrs.pop('autofocus', None)
    
class DriverProfileForm(forms.ModelForm):
    city = forms.CharField(
        widget=forms.TextInput(
            attrs={
                'id': 'city-dropdown', 'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]', 
                'list': 'city-list'
            }
        )
    )
    barangay = forms.CharField(
        widget=forms.TextInput(
            attrs={
                'id': 'barangay-dropdown', 'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]',
                'list': 'barangay-list'
            }
        )
    )

    class Meta:
        model = DriverProfile
        fields = ('contact_number', 'gender', 'city', 'barangay')
        widgets = {
            'contact_number': forms.NumberInput(
                attrs={
                    'type': 'tel', 'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
                }
            ),
            'gender': forms.Select(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]',
                }
            ),
        }

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

class VehicleForm(forms.ModelForm):
    class Meta:
        model = Vehicle
        fields = ('vehicle_type', 'plate_number', 'gate_pass')
        widgets = {
            'vehicle_type': forms.Select(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
                }
            ),
            'plate_number': forms.TextInput(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
                }
            ),
            'gate_pass': forms.TextInput(
                attrs={
                    'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]'
                }
            )
        }