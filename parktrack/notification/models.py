from django.db import models
from django.conf import settings

# Create your models here.

class Notification(models.Model):
    class Type(models.TextChoices):
        EXPIRING_SOON = 'expiring_soon', 'Expiring Soon'
        EXPIRED       = 'expired',       'Expired'
        CANCELLED     = 'cancelled',     'Cancelled'

    recipient    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    notif_type   = models.CharField(max_length=20, choices=Type.choices)
    message      = models.TextField()
    is_read      = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)
    reservation  = models.ForeignKey('reservation.Reservation', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.recipient} | {self.notif_type} | {'read' if self.is_read else 'unread'}"