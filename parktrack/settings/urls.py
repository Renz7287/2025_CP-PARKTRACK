from django.urls import path
from . import views

app_name = 'settings'

urlpatterns = [
    path('personal-information/<int:pk>/', views.personal_information, name='personal-information'),
    path('vehicle-management/<int:pk>/', views.vehicle_management, name='vehicle-management'),
    path('edit-user/<int:pk>/', views.edit_user, name='edit-user'),
    path('add-vehicle/', views.add_vehicle, name='add-vehicle'),
    path('edit-vehicle/<int:pk>/', views.edit_vehicle, name='edit-vehicle'),
    path('delete-vehicle/<int:pk>/', views.delete_vehicle, name='delete-vehicle'),
]
