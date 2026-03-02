from django.utils import timezone
from datetime import timedelta
from reservation.models import Reservation
from .models import Notification

def notify_expiring_soon(minutes_before=30):
    """Flag reservations expiring within the threshold and notify drivers."""
    threshold = timezone.now() + timedelta(minutes=minutes_before)
    soon_expiring = Reservation.objects.filter(
        status='active',
        end_time__lte=threshold,
        end_time__gt=timezone.now(),
    )
    for reservation in soon_expiring:
        already_notified = Notification.objects.filter(
            reservation=reservation,
            notif_type=Notification.Type.EXPIRING_SOON,
        ).exists()
        if not already_notified:
            Notification.objects.create(
                recipient=reservation.driver,
                notif_type=Notification.Type.EXPIRING_SOON,
                message=f"Your reservation for slot {reservation.parking_slot} expires in {minutes_before} minutes.",
                reservation=reservation,
            )