from django.shortcuts import render, redirect
from django.contrib.auth import logout
from django.contrib import messages


def login_view(request):
    if request.user.is_authenticated:
        return redirect('dashboard:index')
    return render(request, 'authentication/login.html')


def logout_view(request):
    logout(request)
    messages.info(request, 'You have been signed out.')
    return redirect('landing_page:home')
