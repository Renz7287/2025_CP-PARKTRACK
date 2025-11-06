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