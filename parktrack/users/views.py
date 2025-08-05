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
        username = request.POST.get('username')
        password = request.POST.get('password')

        try:
            user = User.objects.get(username = username)
        except:
            messages.error(request, 'User does not exists')

        user = authenticate(request, username = username, password = password)

        if user is not None:
            login(request, user)
            return redirect('parking-allotment:view-allotment')
        else:
            messages.error(request, 'Username OR password does not exists')
        
    return render(request, 'users/index.html')

def logout_user(request):
    logout(request)
    return redirect('users:login')