from django.conf import settings
from django.shortcuts import render, redirect


def home(request):
    """Home view for the core app."""
    return render(request, 'core/base.html')


def pin_view(request):
    if request.session.get('site_pin_verified'):
        next_url = request.GET.get('next') or '/'
        if next_url.startswith('/') and not next_url.startswith('//'):
            return redirect(next_url)
        return redirect('landing_page:home')

    error = None
    next_url = request.GET.get('next', '/')

    if request.method == 'POST':
        next_url = request.POST.get('next') or '/'
        submitted = (request.POST.get('pin') or '').strip()
        if submitted == str(settings.SITE_PIN):
            request.session['site_pin_verified'] = True
            if next_url.startswith('/') and not next_url.startswith('//'):
                return redirect(next_url)
            return redirect('landing_page:home')
        error = 'Invalid pin code. Please try again.'

    return render(request, 'core/pin.html', {
        'error': error,
        'next': next_url,
    })