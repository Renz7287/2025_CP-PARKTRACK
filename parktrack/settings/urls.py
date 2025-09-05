from django.urls import path
from . import views

app_name = 'settings'

urlpatterns = [
    path('personal-information/<int:pk>', views.personal_information, name='personal-information'),
    path('vehicle-management/', views.vehicle_management, name='vehicle-management'),
    path('edit-user/', views.edit_user, name='edit-user'),
]
