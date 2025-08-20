from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import User, DriverProfile, Vehicle

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

    def save(self, commit=True):
        user = super().save(commit=False)
        user.role = 'DRIVER'
        
        if commit:
            user.save()

        return user
    
class DriverProfileForm(forms.ModelForm):
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
                    'class': 'text-xs p-2  shadow-xl rounded-lg bg-[#F4F2F2]',
                }
            ),
            'city': forms.TextInput(
                attrs={
                    'id': 'city-dropdown', 'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]', 
                    'list': 'city-list'
                }
            ),
            'barangay': forms.TextInput(
                attrs={
                    'id': 'barangay-dropdown', 'class': 'text-xs p-2 shadow-xl rounded-lg bg-[#F4F2F2]',
                    'list': 'barangay-list'
                }
            ),
        }

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