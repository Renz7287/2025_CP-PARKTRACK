from django.core.mail import send_mail
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

SUBJECTS = {
    'expiring_soon': 'ParkTrack — Your reservation is expiring soon',
    'expired':       'ParkTrack — Your reservation has expired',
    'cancelled':     'ParkTrack — Your reservation has been cancelled',
}

def send_notification_email(recipient, notif_type, message):
    """Send an email mirror of an in-app notification. Fails silently on error."""
    email = getattr(recipient, 'email', None)
    if not email:
        return

    subject = SUBJECTS.get(notif_type, 'ParkTrack Notification')

    body = (
        f"Hi {recipient.get_full_name() or recipient.username},\n\n"
        f"{message}\n\n"
        f"Log in to ParkTrack to view your reservations.\n\n"
        f"— The ParkTrack Team"
    )

    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except Exception as exc:
        logger.warning("Failed to send notification email to %s: %s", email, exc)