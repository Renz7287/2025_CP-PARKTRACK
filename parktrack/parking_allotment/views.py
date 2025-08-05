from django.shortcuts import render
from django.contrib.auth.decorators import login_required

# Create your views here.

@login_required(login_url='/')
def view_allotment(request):
    return render(request, 'parking_allotment/index.html')