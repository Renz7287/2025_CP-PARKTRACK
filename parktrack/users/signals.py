from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import Group
from .models import User

@receiver(post_save, sender=User)
def assign_group_on_register(sender, instance, created, **kwargs):
    if created:
        if instance.is_admin:
            group_name = 'Admin'
        else:
            group_name = 'Driver'

        group, _ = Group.objects.get_or_create(name=group_name)
        instance.groups.add(group)