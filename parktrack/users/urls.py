from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

app_name = 'users'

urlpatterns = [
    path('', auth_views.LoginView.as_view(template_name='users/index.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='users:login'), name='logout'),
    path('register/', views.register_user, name='register'),
    path('address/get-barangays/', views.get_barangays, name='get_barangays'),
]
