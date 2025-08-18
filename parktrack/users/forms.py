from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import User, DriverProfile, Vehicle

class UserForm(UserCreationForm):
    email = forms.EmailField(required=True)
    
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ('first_name', 'middle_name', 'last_name', 'email')

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

class VehicleForm(forms.ModelForm):
    class Meta:
        model = Vehicle
        fields = ('vehicle_type', 'plate_number', 'gate_pass')