from django.db import models

# Create your models here.

class Camera(models.Model):
    """
    Represents a physical camera/webcam connected to a Raspberry Pi device.
    Each camera monitors a parking area and can have multiple parking slots.
    """
    name = models.CharField(max_length=100)                         # e.g. "Main Entrance Camera"
    location = models.CharField(max_length=255, blank=True)         # e.g. "Building A - Ground Floor"
    stream_url = models.CharField(max_length=500, blank=True)       # URL where Pi streams video
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Camera'
        verbose_name_plural = 'Cameras'

    def __str__(self):
        return self.name


class ParkingSlot(models.Model):
    """
    Represents a single parking slot with a polygon drawn over the camera feed.
    polygon_points stores a list of [x, y] normalized coordinates (0.0 to 1.0)
    so they scale correctly regardless of video resolution.

    Example polygon_points value:
    [[0.1, 0.2], [0.3, 0.2], [0.3, 0.5], [0.1, 0.5]]
    """
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('occupied', 'Occupied'),
        ('reserved', 'Reserved'),
        ('disabled', 'Disabled'),
    ]

    camera = models.ForeignKey(Camera, on_delete=models.CASCADE, related_name='parking_slots')
    slot_label = models.CharField(max_length=50)                    # e.g. "A1", "B3"
    polygon_points = models.JSONField(default=list)                 # [[x1,y1], [x2,y2], ...]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['camera', 'slot_label']
        verbose_name = 'Parking Slot'
        verbose_name_plural = 'Parking Slots'
        # Ensure slot labels are unique per camera
        unique_together = [['camera', 'slot_label']]

    def __str__(self):
        return f"{self.camera.name} – Slot {self.slot_label}"

    def to_dict(self):
        """
        Returns a clean dictionary representation.
        Used by views when building JsonResponse payloads
        and by the Raspberry Pi polling endpoint.
        """
        return {
            'id': self.id,
            'camera_id': self.camera_id,
            'slot_label': self.slot_label,
            'polygon_points': self.polygon_points,
            'status': self.status,
            'is_active': self.is_active,
            'updated_at': self.updated_at.isoformat(),
        }