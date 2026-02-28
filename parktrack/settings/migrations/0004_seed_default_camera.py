# settings/migrations/XXXX_seed_default_camera.py
# Rename XXXX to the next migration number in your settings/migrations/ folder
# e.g. if your last migration is 0003_..., name this 0004_seed_default_camera.py

from django.db import migrations


def seed_camera(apps, schema_editor):
    Camera = apps.get_model('settings', 'Camera')
    # Only create if no camera exists yet — safe to run multiple times
    if not Camera.objects.exists():
        Camera.objects.create(
            name='Main Camera',
            location='Main Entrance',
            stream_url='/stream/stream.m3u8',
            snapshot_url='',
            is_active=True,
        )


def unseed_camera(apps, schema_editor):
    Camera = apps.get_model('settings', 'Camera')
    Camera.objects.filter(name='Main Camera').delete()


class Migration(migrations.Migration):

    # Replace 'XXXX_previous_migration_name' with your actual last migration
    dependencies = [
        ('settings', '0003_alter_camera_stream_url'),
    ]

    operations = [
        migrations.RunPython(seed_camera, reverse_code=unseed_camera),
    ]