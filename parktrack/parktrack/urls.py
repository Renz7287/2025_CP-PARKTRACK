"""parktrack URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import requests as http_requests
from django.contrib import admin
from django.urls import path, re_path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, Http404
from django.views.decorators.cache import never_cache

PI_STREAM_BASE = 'http://10.246.146.183:8080'

@never_cache
def stream_proxy(request, filename):    
    # Proxies HLS stream files (.m3u8 playlist and .ts segments) from the Pi's
    # HTTP server through Django. This avoids CORS and mixed-content errors since
    # the browser only ever talks to the Django origin.
    
    try:
        url = f'{PI_STREAM_BASE}/{filename}'
        r = http_requests.get(url, timeout=5, stream=True)
        if r.status_code == 404:
            raise Http404
        content_type = (
            'application/vnd.apple.mpegurl' if filename.endswith('.m3u8')
            else 'video/mp2t'
        )
        return HttpResponse(r.content, content_type=content_type)
    except http_requests.RequestException:
        raise Http404

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('users.urls', namespace='users')),
    path('parking-allotment/', include('parking_allotment.urls', namespace='parking-allotment')),
    path('settings/', include('settings.urls', namespace='settings')),
    path('parking-usage/', include('parking_usage.urls', namespace='parking-usage')),
    path('notification/', include('notification.urls', namespace='notification')),
    re_path(r'^stream/(?P<filename>[^/]+\.(m3u8|ts))$', stream_proxy, name='stream_proxy'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)