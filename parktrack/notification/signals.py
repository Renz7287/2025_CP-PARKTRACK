from django.db.models.signals import post_save
from django.dispatch import receiver
from reservation.models import Reservation
from .models import Notification
from .emails import send_notification_email


def _create_and_email(recipient, notif_type, message, reservation):
    """Create an in-app notification and send its email mirror."""
    Notification.objects.create(
        recipient=recipient,
        notif_type=notif_type,
        message=message,
        reservation=reservation,
    )
    send_notification_email(recipient, notif_type, message)


@receiver(post_save, sender=Reservation)
def handle_reservation_status_change(sender, instance, created, **kwargs):
    if created:
        return

    if instance.status == 'cancelled':
        already_notified = Notification.objects.filter(
            reservation=instance,
            notif_type=Notification.Type.CANCELLED,
        ).exists()
        if already_notified:
            return

        if instance.cancelled_by_admin:
            _create_and_email(
                recipient=instance.user,
                notif_type=Notification.Type.CANCELLED,
                message=f"Your reservation for slot {instance.slot.slot_label} has been cancelled by an admin.",
                reservation=instance,
            )
        else:
            _create_and_email(
                recipient=instance.user,
                notif_type=Notification.Type.CANCELLED,
                message=f"Your reservation for slot {instance.slot.slot_label} has been cancelled.",
                reservation=instance,
            )
            from django.contrib.auth import get_user_model
            User = get_user_model()
            for admin in User.objects.filter(is_admin=True):
                _create_and_email(
                    recipient=admin,
                    notif_type=Notification.Type.CANCELLED,
                    message=f"{instance.user.get_full_name() or instance.user.email} cancelled their reservation for slot {instance.slot.slot_label}.",
                    reservation=instance,
                )

    elif instance.status == 'expired':
        already_notified = Notification.objects.filter(
            reservation=instance,
            notif_type=Notification.Type.EXPIRED,
        ).exists()
        if already_notified:
            return

        _create_and_email(
            recipient=instance.user,
            notif_type=Notification.Type.EXPIRED,
            message=f"Your reservation for slot {instance.slot.slot_label} has expired.",
            reservation=instance,
        )