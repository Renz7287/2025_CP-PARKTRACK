from django.db import models

# Create your models here.

class Camera(models.Model):
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=255, blank=True)
    stream_url = models.CharField(max_length=500, blank=True, default='/stream/stream.m3u8')
    snapshot_url = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering       = ['name']
        verbose_name   = 'Camera'
        verbose_name_plural = 'Cameras'

    def __str__(self):
        return self.name

    def to_dict(self):
        return {
            'id':           self.id,
            'name':         self.name,
            'location':     self.location or '',
            'stream_url':   self.stream_url or '',
            'snapshot_url': self.snapshot_url or '',
        }

class ParkingSlot(models.Model):
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
        return {
            'id':              self.id,
            'camera_id':       self.camera_id,
            'slot_label':      self.slot_label,
            'polygon_points':  self.polygon_points,
            'status':          self.status,
            'is_active':       self.is_active,
            'is_reservable':   self.status == 'available' and self.is_active,
            'updated_at':      self.updated_at.isoformat(),
        }