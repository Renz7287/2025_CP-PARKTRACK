from django.db import models
from django.conf import settings
from django.contrib.auth.models import BaseUserManager, AbstractUser

# Create your models here.

class City(models.Model):
    id = models.AutoField(primary_key=True)
    psgcCode = models.CharField(max_length=10)
    citymunDesc = models.CharField(max_length=255)
    regDesc = models.CharField(max_length=10)
    provCode = models.CharField(max_length=10)
    citymunCode = models.CharField(max_length=10)

    class Meta:
        db_table = 'refcitymun'
        managed = False

class Barangay(models.Model):
    id = models.AutoField(primary_key=True)
    brgyDesc = models.CharField(max_length=255)
    regCode = models.CharField(max_length=10)
    provCode = models.CharField(max_length=10)
    citymunCode = models.CharField(max_length=10)
    brgyCode = models.CharField(max_length=10)

    class Meta:
        db_table = 'refcitymun'
        managed = False

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        email = self.normalize_email(email)

        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)

        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', User.Role.ADMIN)
        email = self.normalize_email(email)

        return self.create_user(email, password, **extra_fields)

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'A', 'Admin'
        DRIVER = 'D', 'Driver'

    first_name = models.CharField(max_length=255)
    middle_name = models.CharField(max_length=255, null=True, blank=True)
    last_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=1, choices=Role.choices, default=Role.DRIVER)
    profile_picture = models.ImageField(upload_to='images/', default='images/avatar.svg')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    objects = UserManager()

class DriverProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = 'M', 'Male'
        FEMALE = 'F', 'Female'
        OTHERS = 'O', 'Others'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='driver_profile', 
        limit_choices_to={'role': User.Role.DRIVER}
    )
    contact_number = models.IntegerField()
    gender = models.CharField(max_length=1, choices=Gender.choices)
    city = models.ForeignKey(City, on_delete=models.SET_NULL, null=True, to_field='id')
    barangay = models.ForeignKey(Barangay, on_delete=models.SET_NULL, null=True, to_field='id')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Vehicle(models.Model):
    class VehicleType(models.TextChoices):
        FOURWHEELS = 'FW', 'Four-wheels'
        TWOWHEELS = 'TW', 'Two-wheels'

    owner = models.ForeignKey(DriverProfile, on_delete=models.CASCADE, related_name='vehicles')
    vehicle_type = models.CharField(max_length=2, choices=VehicleType.choices)
    plate_number = models.CharField(max_length=100)
    gate_pass = models.CharField(max_length=100, null=True, blank=True) 
    is_registered = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        self.is_registered = bool(self.gate_pass)
        super().save(*args, **kwargs)