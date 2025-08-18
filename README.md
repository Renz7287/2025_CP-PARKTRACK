# ParkTrack: Computer Vision-Based Smart Parking Management System with Real-Time Monitoring Using YOLOv8

## 📖 Project Description

**ParkTrack** is a **Computer Vision-Based Smart Parking Management System** that aims to offer a **low-cost, scalable, and efficient alternative** to existing parking systems. Rather than using costly ground sensors or manual checking, ParkTrack uses **real-time video processing** and **deep learning (YOLOv8)** to identify vehicles, determine the availability of parking slots, and identify license plates.

The system is built to address the challenges of **urban parking inefficiency**, such as congestion, wasted fuel, and prolonged vehicle search times. By using a simple **USB camera setup** combined with computer vision.

A **Django-based web dashboard** is the centralized interface for both drivers and administrators:

- **Drivers** can access real-time parking slot availability and violation notifications.
- **Administrators** are able to oversee all slots, check vehicle entry/exit history, handle violations, and issue visitor passes.


### 🔑 Key Highlights

- **Real-Time Detection**: Detects empty and occupied slots.
- **License Plate Recognition**: Boosts security and vehicle monitoring.
- **Violation Monitoring**: Catches unauthorized parking and unregistered cars.
- **Web Dashboard**: Offers admins and drivers real-time updates and insights.
- **Low-Cost Deployment**: Does away with the use of per-slot sensors.
- **Scalable Design**: Highly expansible to several cameras and extensive parking lots.

---

## 🚀 Features

- Real-time parking slot detection using YOLOv8
- License Plate Recognition (LPR) for logging and security of vehicles
- Web dashboard powered by Django with TailwindCSS frontend
- Role-based authorization (Drivers & Admins)
- Slot violation alerts and warnings
- Daily usage reports and analytics
- Camera-only installation (no sensors per-slot required)
