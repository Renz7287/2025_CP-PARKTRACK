from django.shortcuts import render
from utils.decorators import group_required

# Create your views here.

@group_required('Admin')
def parking_usage(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'parking_usage/index.html', context)