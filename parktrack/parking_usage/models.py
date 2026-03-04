from django.db import models

# Create your models here.
class ParkingSlot(models.Model):
    slot_id = models.CharField(max_length=20)
    is_occupied = models.BooleanField(default=False)
    last_updated = models.DateTimeField(auto_now=True)

class SlotStatusLog(models.Model):
    slot = models.ForeignKey(ParkingSlot, on_delete=models.CASCADE)
    timestamp = models.DateTimeField(auto_now_add=True)
    is_occupied = models.BooleanField()

class VehicleEntry(models.Model):
    ENTRY_TYPE_CHOICES = [
        ('entry', 'Entry'),
        ('exit',  'Exit'),
    ]
    entry_type = models.CharField(max_length=10, choices=ENTRY_TYPE_CHOICES, default='entry')
    timestamp  = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.entry_type} at {self.timestamp}"