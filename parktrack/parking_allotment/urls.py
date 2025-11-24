from django.urls import path
from . import views

app_name = 'parking_allotment'

urlpatterns = [
    path('', views.parking_allotment, name='parking-allotment'),
    path('upload-video/', views.upload_video, name='upload-video'),
    path('api/parking-status/', views.parking_status, name='api-parking-status'),
]
