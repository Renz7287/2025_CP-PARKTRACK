from django.db import models


class OccupancySnapshot(models.Model):
    """Periodic record of parking occupancy pushed by the Pi."""
    occupied   = models.IntegerField(default=0)
    vacant     = models.IntegerField(default=0)
    total      = models.IntegerField(default=0)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-recorded_at']

    def __str__(self):
        return f"{self.recorded_at} — {self.occupied}/{self.total} occupied"