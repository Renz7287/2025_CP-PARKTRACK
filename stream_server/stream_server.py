import http.server
import socketserver
import subprocess
import os

PORT = 8080
OUTPUT_DIR = 'static/live'

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

subprocess.Popen(ffmpeg_command)

os.chdir('static')
handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(('', PORT), handler)

print(f'Serving at http://localhost:{PORT}/live/stream.m3u8')

httpd.serve_forever()