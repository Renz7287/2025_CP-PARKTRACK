from django.urls import path
from . import views

app_name = 'parking_allotment'

urlpatterns = [
    path('', views.view_allotment, name='view-allotment'),
]
