from django.urls import path
from . import views

app_name = 'settings'

urlpatterns = [
    path('', views.view_settings, name='view-settings'),
]
