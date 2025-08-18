# ParkTrack: Computer Vision-Based Smart Parking Management System with Real-Time Monitoring Using YOLOv8

## 📖 Project Description

**ParkTrack** is a **Computer Vision-Based Smart Parking Management System** designed to provide a **low-cost, scalable, and efficient alternative** to traditional parking systems. Instead of relying on expensive ground sensors or manual monitoring, ParkTrack leverages **real-time video processing** and **deep learning (YOLOv8)** to detect vehicles, determine parking slot availability, and recognize license plates.

The system is built to address the challenges of **urban parking inefficiency**, such as congestion, wasted fuel, and prolonged vehicle search times. By using a simple **USB camera setup** combined with computer vision.

A **Django-based web dashboard** serves as the central platform for both drivers and administrators:

- **Drivers** can view real-time parking slot availability and receive notifications for violations.
- **Administrators** can monitor all slots, review vehicle entry/exit logs, manage violations, and generate visitor passes.

In addition to **slot occupancy detection**, ParkTrack integrates **License Plate Recognition (LPR)** using YOLOv8 and Tesseract OCR. This allows the system to automatically log vehicle plates, track unregistered entries, and enhance parking enforcement measures.

### 🔑 Key Highlights

- **Real-Time Detection**: Identifies vacant and occupied slots.
- **License Plate Recognition**: Enhances security and vehicle tracking.
- **Violation Monitoring**: Detects improper parking and unregistered vehicles.
- **Web Dashboard**: Provides drivers and admins with live updates and analytics.
- **Low-Cost Deployment**: Eliminates the need for per-slot sensors.
- **Scalable Design**: Easily expandable to multiple cameras and larger parking areas.

---

## 🚀 Features

- Real-time parking slot detection with YOLOv8
- License Plate Recognition (LPR) for vehicle logging and security
- Django-powered web dashboard with TailwindCSS frontend
- Role-based access control (Drivers & Admins)
- Violation alerts and notifications
- Daily analytics and usage reports
- Camera-only setup (no per-slot sensors required)
