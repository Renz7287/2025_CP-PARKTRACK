from django.urls import path
from . import views

app_name = 'parking_usage'

urlpatterns = [
    path('', views.parking_usage, name='parking-usage'),
]