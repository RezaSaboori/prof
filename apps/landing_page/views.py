from django.shortcuts import render


def home(request):
    """Landing page home view."""
    return render(request, 'landing_page/home.html', {'landing_page': True})
