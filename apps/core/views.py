from django.shortcuts import render


def home(request):
    """Home view for the core app."""
    return render(request, 'core/base.html')
