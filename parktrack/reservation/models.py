from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from settings.models import ParkingSlot  # ← reuse the existing model

User = get_user_model()

class Reservation(models.Model):
    STATUS_CHOICES = [
        ('active',    'Active'),
        ('expired',   'Expired'),
        ('cancelled', 'Cancelled'),
        ('fulfilled', 'Fulfilled'),  
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reservations',
    )
    slot = models.ForeignKey(
        ParkingSlot,
        on_delete=models.CASCADE,
        related_name='reservations',
    )
    plate_number = models.CharField(max_length=20)
    arrival_time = models.DateTimeField(
        help_text="Expected arrival time selected by the user."
    )
    expiry_time = models.DateTimeField(
        editable=False,
        help_text="Auto-set to arrival_time + 5 minutes.",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by_admin = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # A slot can only have ONE active reservation at a time
            models.UniqueConstraint(
                fields=['slot', 'status'],
                condition=models.Q(status='active'),
                name='unique_active_reservation_per_slot',
            )
        ]

    def __str__(self):
        return (
            f"{self.user} → Slot {self.slot.slot_label} "
            f"@ {self.arrival_time:%H:%M} ({self.status})"
        )

    def save(self, *args, **kwargs):
        # Auto-compute expiry on first save
        if not self.pk and not self.expiry_time:
            self.expiry_time = self.arrival_time + timedelta(minutes=5)
        super().save(*args, **kwargs)

    # Properties / helpers
    @property
    def is_expired(self):
        return timezone.now() > self.expiry_time

    def check_and_expire(self):
        if self.status == 'active' and self.is_expired:
            self.status = 'expired'
            self.save()  # full save so post_save signal fires
            if self.slot.status == 'reserved':
                self.slot.status = 'available'
                self.slot.save(update_fields=['status', 'updated_at'])
            return True
        return False

    def cancel(self, by_admin=False):
        """Cancel this reservation and free the slot."""
        self.status = 'cancelled'
        self.cancelled_at = timezone.now()
        self.cancelled_by_admin = by_admin
        self.save()  # full save so post_save signal fires
        if self.slot.status == 'reserved':
            self.slot.status = 'available'
            self.slot.save(update_fields=['status', 'updated_at'])

    def to_dict(self):
        return {
            'id':           self.id,
            'slot_id':      self.slot_id,
            'slot_label':   self.slot.slot_label,
            'camera_id':    self.slot.camera_id,
            'plate_number': self.plate_number,
            'arrival_time': self.arrival_time.isoformat(),
            'expiry_time':  self.expiry_time.isoformat(),
            'status':       self.status,
            'created_at':   self.created_at.isoformat(),
            'user_name':    self.user.get_full_name() or self.user.username,
            'cancelled_by_admin': self.cancelled_by_admin,
        }