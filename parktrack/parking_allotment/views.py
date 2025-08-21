from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.shortcuts import render


# Create your views here.

@login_required(login_url='/')
def parking_allotment(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'
    context = {
        'is_partial': is_ajax,
    }
    return render(request, 'parking_allotment/index.html', context)

def motorcycle_allotment(request):
    return render(request, 'parking_allotment/motorcycle.html')