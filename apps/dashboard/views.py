from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required
def index(request):
    """Dashboard index view."""
    return render(request, 'dashboard/index.html')


@login_required
def profile(request):
    """User profile view."""
    return render(request, 'dashboard/profile.html')
