from django.shortcuts import render
from django.contrib.auth.decorators import login_required

# Create your views here.

@login_required
def parking_usage(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'parking_usage/index.html', context)