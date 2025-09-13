import http.server
import socket
import socketserver
import subprocess
import os
import signal
import sys
from functools import partial

PORT = 8080
# OUTPUT_DIR = 'static/live'
OUTPUT_DIR = os.path.join(os.getcwd(), 'static', 'live')
os.makedirs(OUTPUT_DIR, exist_ok=True)

ffmpeg_command = [
    'ffmpeg',
    '-f', 'dshow', '-i', 'video=ACER HD User Facing',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-c:a', 'aac', '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments',
    '-hls_segment_filename', os.path.join(OUTPUT_DIR, 'stream_%03d.ts'),
    os.path.join(OUTPUT_DIR, 'stream.m3u8')
]

process = subprocess.Popen(ffmpeg_command)

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Origin, Accept, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

os.chdir('static')

Handler = partial(CORSRequestHandler)
httpd = socketserver.ThreadingTCPServer(('', PORT), Handler)

print(f'Serving at http://{socket.gethostbyname(socket.gethostname())}:{PORT}/live/stream.m3u8')

def shutdown(sig, frame):
    print('Shutting down...')

    try:
        process.terminate()
    except Exception:
        pass
    httpd.shutdown()
    sys.exit(0)

signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)

httpd.serve_forever()