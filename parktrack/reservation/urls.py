from django.urls import path
from . import views

app_name = 'reservation'

urlpatterns = [
    path('', views.reservation, name='reservation'),
    path('slots/',                       views.get_available_slots,      name='reservation_slots'),
    path('my/',                          views.get_my_reservations,      name='my_reservations'),
    path('create/',                      views.create_reservation,       name='create_reservation'),
    path('<int:reservation_id>/cancel/', views.cancel_reservation,       name='cancel_reservation'),
    path('admin/all/',                   views.admin_get_all_reservations, name='admin_all_reservations'),
    path('admin/slot/toggle/',           views.admin_toggle_slot,        name='admin_toggle_slot'),
]