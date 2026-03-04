from django.urls import path
from . import views

app_name = 'parking_usage'

urlpatterns = [
    path('', views.parking_usage, name='parking-usage'),
    path('api/stats/', views.get_parking_stats, name='get_stats'),
    path('api/record-occupancy/', views.record_occupancy, name='record_occupancy'),
]