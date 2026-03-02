from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from datetime import timedelta
from .models import Notification

def check_expiring_reservations(user):
    from reservation.models import Reservation

    threshold = timezone.now() + timedelta(minutes=30)
    soon_expiring = Reservation.objects.filter(
        user=user,
        status='active',
        expiry_time__lte=threshold,
        expiry_time__gt=timezone.now(),
    )
    for reservation in soon_expiring:
        already_notified = Notification.objects.filter(
            reservation=reservation,
            notif_type=Notification.Type.EXPIRING_SOON,
        ).exists()
        if not already_notified:
            Notification.objects.create(
                recipient=user,
                notif_type=Notification.Type.EXPIRING_SOON,
                message=f"Your reservation for slot {reservation.slot} expires in less than 30 minutes.",
                reservation=reservation,
            )

@login_required
def notification(request):
    is_ajax = request.headers.get('x-requested-with') == 'XMLHttpRequest'

    if not request.user.is_admin:
        check_expiring_reservations(request.user)

    notifs = Notification.objects.filter(recipient=request.user)
    unread_count = notifs.filter(is_read=False).count()

    return render(request, 'notification/index.html', {
        'is_partial': is_ajax,
        'notifications': notifs,
        'unread_count': unread_count,
    })

@login_required
def mark_all_read(request):
    if request.method == 'POST':
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return JsonResponse({'status': 'ok'})
    return JsonResponse({'status': 'error'}, status=405)

@login_required
def mark_one_read(request, pk):
    if request.method == 'POST':
        notif = get_object_or_404(Notification, pk=pk, recipient=request.user)
        notif.is_read = True
        notif.save()
        return JsonResponse({'status': 'ok'})
    return JsonResponse({'status': 'error'}, status=405)

@login_required
def unread_count(request):
    count = Notification.objects.filter(recipient=request.user, is_read=False).count()
    return JsonResponse({'count': count})