from django.db import models
from django.conf import settings
from django.contrib.auth.models import BaseUserManager, AbstractUser

# Create your models here.

class City(models.Model):
    id = models.AutoField(primary_key=True)
    psgcCode = models.CharField(max_length=10)
    citymunDesc = models.CharField(max_length=255)
    regCode = models.CharField(max_length=10)
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
        db_table = 'refbrgy'
        managed = False

class VehicleType(models.Model):
    type_name = models.CharField(max_length=100)

    def __str__(self):
        return self.type_name

class VehicleBrand(models.Model):
    brand_name = models.CharField(max_length=100)
    type = models.CharField(max_length=10)

    def __str__(self):
        return self.brand_name

class VehicleModel(models.Model):
    model_name = models.CharField(max_length=100)
    brand = models.CharField(max_length=10)

    def __str__(self):
        return self.model_name

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        extra_fields.setdefault('is_admin', False)
        email = self.normalize_email(email)

        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)

        return user
    
    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_admin', True)
        email = self.normalize_email(email)

        return self.create_user(email, password, **extra_fields)

class User(AbstractUser):
    username = None
    first_name = models.CharField(max_length=255)
    middle_name = models.CharField(max_length=255, null=True, blank=True)
    last_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    is_admin = models.BooleanField(default=False)
    profile_picture = models.ImageField(upload_to='images/', default='images/avatar.svg')

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

class DriverProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = 'M', 'Male'
        FEMALE = 'F', 'Female'
        OTHERS = 'O', 'Others'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='driver_profile'
    )
    contact_number = models.CharField(max_length=11)
    gender = models.CharField(max_length=1, choices=Gender.choices)
    city = models.ForeignKey(City, on_delete=models.SET_NULL, null=True, to_field='id')
    barangay = models.ForeignKey(Barangay, on_delete=models.SET_NULL, null=True, to_field='id')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Vehicle(models.Model):
    owner = models.ForeignKey(DriverProfile, on_delete=models.CASCADE, related_name='vehicles')
    vehicle_type = models.ForeignKey(VehicleType, on_delete=models.SET_NULL, null=True)
    brand = models.ForeignKey(VehicleBrand, on_delete=models.SET_NULL, null=True)
    model = models.ForeignKey(VehicleModel, on_delete=models.SET_NULL, null=True)
    color = models.CharField(max_length=100)
    plate_number = models.CharField(max_length=100)
    gate_pass = models.CharField(max_length=100, null=True, blank=True) 
    is_registered = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        self.is_registered = bool(self.gate_pass)
        super().save(*args, **kwargs)