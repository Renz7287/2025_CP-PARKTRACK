from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required

# Restrict register page to authenticated users
def unauthenticated_user(view_function):

    def _wrapped_view(request, *args, **kwargs):

        if request.user.is_authenticated:
            return redirect('parking_allotment:parking-allotment')
        else:
            return view_function(request, *args, **kwargs)
        
    return _wrapped_view

def group_required(*group_names):

    def decorator(view_function):

        @login_required
        def _wrapped_view(request, *args, **kwargs):

            if request.user.groups.filter(name__in=group_names).exists():
                return view_function(request, *args, **kwargs)
            
            return HttpResponseForbidden('You do not have permission to view this page.')
        
        return _wrapped_view
    
    return decorator