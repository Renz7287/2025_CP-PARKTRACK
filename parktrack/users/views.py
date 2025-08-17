from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User

# Create your views here.

def login_user(request):
    if request.user.is_authenticated:
        # redirect location subject to change
        return redirect('parking-allotment:view-allotment')

    if request.method == 'POST':
        email = request.POST.get('email').lower()
        password = request.POST.get('password')

        user = authenticate(request, username = email, password = password)

        if user is not None:
            login(request, user)
            return redirect('parking-allotment:view-allotment')
        else:
            messages.error(request, 'Email OR password does not exists')
        
    return render(request, 'users/index.html')

def logout_user(request):
    logout(request)
    return redirect('users:login')