from django.urls import path
from . import views

app_name = 'settings'

urlpatterns = [
    path('<int:pk>', views.account_settings, name='account-settings'),
    path('vehicle-management/', views.vehicle_management, name='vehicle-management'),
]
