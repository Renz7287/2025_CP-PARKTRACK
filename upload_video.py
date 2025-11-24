import requests

API_KEY = 'parktrack@2025'

# For pythonanywhere
# SERVER_UPLOAD_URL = 'https://parktrack.pythonanywhere.com/parking-allotment/upload-video/'

# For local testing
SERVER_UPLOAD_URL = 'http://127.0.0.1:8000/parking-allotment/upload-video/'

def upload_video(path='C:/Users/Ejay/PycharmProjects/ObjectDetectionYolo/parktrack/Videos/test-2.mp4'):

    with open(path, 'rb') as file:
        files = {'file': ('sample.mp4', file, 'video/mp4')}
        headers = {"X-API-KEY": API_KEY}
        response = requests.post(SERVER_UPLOAD_URL, files=files, headers=headers)

    print('Server response:', response.text)

upload_video()