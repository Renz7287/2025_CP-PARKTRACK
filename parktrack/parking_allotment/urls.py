from django.urls import path
from . import views

app_name = 'parking_allotment'

urlpatterns = [
    path('', views.parking_allotment, name='parking-allotment'),
    path('motorcycles/', views.motorcycle_allotment, name='motorcycles'),
]
