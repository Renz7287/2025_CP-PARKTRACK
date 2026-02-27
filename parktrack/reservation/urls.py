from django.urls import path
from . import views

app_name = 'reservation'

urlpatterns = [
    path('', views.reservation, name='reservation'),
    path('reservations/slots/', views.get_available_slots, name='reservation_slots'),
    path('reservations/my/', views.get_my_reservations, name='my_reservations'),
    path('reservations/create/', views.create_reservation, name='create_reservation'),
    path('reservations/admin/all/', views.admin_get_all_reservations, name='admin_all_reservations'),
]