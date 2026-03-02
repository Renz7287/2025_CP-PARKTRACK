from django.urls import path
from . import views

app_name = 'notification'

urlpatterns = [
    path('', views.notification, name='notification'),
    path('mark-all-read/', views.mark_all_read, name='mark-all-read'),
    path('mark-read/<int:pk>/', views.mark_one_read, name='mark-one-read'),
    path('unread-count/', views.unread_count, name='unread-count'),
]