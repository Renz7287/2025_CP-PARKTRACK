from django.urls import path
from django.contrib.auth import views as auth_views
from .views import CustomLoginView
from . import views

app_name = 'users'

urlpatterns = [
    path('', CustomLoginView.as_view(), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='users:login'), name='logout'),
    path('register/', views.register_user, name='register'),
    path('address/get-barangays/', views.get_barangays, name='get-barangays'),
    path('vehicles/get-models/', views.get_models, name='get-models'),
]
