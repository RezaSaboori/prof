from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm


def login_view(request):
    """Login view for authentication."""
    if request.method == 'POST':
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                messages.success(request, f'Welcome back, {username}!')
                return redirect('dashboard:index')
            else:
                messages.error(request, 'Invalid username or password.')
        else:
            messages.error(request, 'Invalid username or password.')
    else:
        form = AuthenticationForm()
    
    return render(request, 'authentication/login.html', {'form': form})


def register_view(request):
    """Register view for new users."""
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            username = form.cleaned_data.get('username')
            messages.success(request, f'Account created for {username}! You can now log in.')
            return redirect('authentication:login')
        else:
            messages.error(request, 'Registration failed. Please correct the errors.')
    else:
        form = UserCreationForm()
    
    return render(request, 'authentication/register.html', {'form': form})


def logout_view(request):
    """Logout view."""
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('landing_page:home')
