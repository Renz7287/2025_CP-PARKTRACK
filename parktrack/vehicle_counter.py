import cv2
import requests

cap = cv2.VideoCapture(0)
fgbg = cv2.createBackgroundSubtractorMOG2()
LINE_Y = 300 # Position of your detection line
server_url = "http://YOUR_COMPUTER_IP:8000/parking_usage/api/increment/"

while True:
    ret, frame = cap.read()
    fgmask = fgbg.apply(frame)
    contours, _ = cv2.findContours(fgmask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        if cv2.contourArea(cnt) < 1000: continue
        x, y, w, h = cv2.boundingRect(cnt)
        if (LINE_Y - 5) < (y + h//2) < (LINE_Y + 5):
            requests.post(server_url) # Notify Django
            cv2.line(frame, (0, LINE_Y), (640, LINE_Y), (0, 255, 0), 5)
            
    cv2.imshow('Pi Counter', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break