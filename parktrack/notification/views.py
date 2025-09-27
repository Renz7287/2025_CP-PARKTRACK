from django.shortcuts import render
from utils.decorators import group_required

# Create your views here.

@group_required('Admin', 'Driver')
def notification(request):
    return render(request, 'notification/index.html')