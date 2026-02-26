from django.urls import path
from . import views

app_name = 'settings'

urlpatterns = [
    path('personal-information/<int:pk>/', views.personal_information, name='personal-information'),
    path('vehicle-management/<int:pk>/', views.vehicle_management, name='vehicle-management'),
    path('parking-slot-management/<int:pk>/', views.parking_slot_management, name='parking-slot-management'),
    path('edit-user/<int:pk>/', views.edit_user, name='edit-user'),
    path('change-password/<int:pk>/', views.change_password, name='change-password'),
    path('add-vehicle/', views.add_vehicle, name='add-vehicle'),
    path('edit-vehicle/<int:pk>/', views.edit_vehicle, name='edit-vehicle'),
    path('delete-vehicle/<int:pk>/', views.delete_vehicle, name='delete-vehicle'),
    path('api/slots/', views.api_get_slots, name='api_get_slots'),
    path('api/slots/add/', views.api_add_slot, name='api_add_slot'),
    path('api/slots/bulk-save/', views.api_bulk_save_slots, name='api_bulk_save_slots'),
    path('api/slots/<int:pk>/update/',views.api_update_slot, name='api_update_slot'),
    path('api/slots/<int:pk>/delete/', views.api_delete_slot, name='api_delete_slot'),
    path('api/cameras/', views.api_get_cameras, name='api_get_cameras'),
    path('api/cameras/add/', views.api_add_camera, name='api_add_camera'),
    path('api/cameras/<int:pk>/edit/', views.api_edit_camera, name='api_edit_camera'),
    path('api/cameras/<int:pk>/delete/', views.api_delete_camera, name='api_delete_camera'),
    path('api/cameras/<int:pk>/upload-snapshot/', views.api_upload_snapshot, name='api_upload_snapshot'),
]
