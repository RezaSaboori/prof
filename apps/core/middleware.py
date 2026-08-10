from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse
from urllib.parse import urlencode


class SitePinMiddleware:
    """Require a site-wide pin before any page is accessible."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.session.get('site_pin_verified'):
            return self.get_response(request)

        path = request.path

        if self._is_exempt(path):
            return self.get_response(request)

        pin_url = reverse('core:pin')
        query = urlencode({'next': request.get_full_path()})
        return redirect(f'{pin_url}?{query}')

    def _is_exempt(self, path):
        static_prefix = '/' + settings.STATIC_URL.lstrip('/')
        media_prefix = '/' + settings.MEDIA_URL.lstrip('/')

        if path.startswith(static_prefix):
            return True
        if path.startswith(media_prefix):
            return True
        if path.startswith('/pin'):
            return True
        return False