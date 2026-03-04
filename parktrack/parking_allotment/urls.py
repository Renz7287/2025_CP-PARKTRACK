from django.urls import path
from . import views

app_name = 'parking_allotment'

urlpatterns = [
    path('', views.parking_allotment, name='parking-allotment'),
    path('upload-video/', views.upload_video, name='upload-video'),
    path('api/parking-status/', views.parking_status, name='api-parking-status'),
    path('api/latest-snapshot/', views.latest_snapshot, name='api-latest-snapshot'),
    path('api/clean-snapshot/', views.api_clean_snapshot, name='api-clean-snapshot'),
    path('api/vacant-slots/', views.vacant_slots_status, name='api-vacant-slots'),
    path('api/upload-snapshot/', views.upload_snapshot, name='upload_snapshot'),
    path('api/upload-clean-snapshot/', views.upload_clean_snapshot, name='upload_clean_snapshot'),
    path('api/upload-status/', views.upload_status, name='upload_status'),
    path('api/stream/push/<str:filename>', views.push_stream_segment, name='push_stream_segment'),
    path('api/stream/push-clean/<str:filename>', views.push_clean_stream_segment, name='push_clean_stream_segment'),
    path('stream/<str:filename>', views.serve_hls, name='serve_hls'),
]