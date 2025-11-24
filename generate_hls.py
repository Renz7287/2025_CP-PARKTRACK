import os
import subprocess

# For pythonanywhere
# BASE = 'home/parktrack/CP_2025-PARKTRACK/parktrack/media/video_stream/'

# For local testing
BASE = 'C:/Users/Ejay/Documents/Github/PARKTRACK/parktrack/media/video_stream/'

mp4_path = os.path.join(BASE, 'input.mp4')
output_playlist = os.path.join(BASE, 'stream.m3u8')

if not os.path.exists(mp4_path):
    print('MP4 not found. Upload first.')
    exit()

# Delete old segments
for file in os.listdir(BASE):
    if file.endswith('.ts') or file.endswith('.m3u8'):
        os.remove(os.path.join(BASE, file))

ffmpeg_cmd = [
    'ffmpeg',
    '-i', mp4_path,
    # '-profile:v', 'baseline',
    # '-level', '3.0',
    # '-s', '640x360',
    '-start_number', '0',
    '-hls_time', '',
    '-hls_list_size', '6',
    '-f', 'hls',
    output_playlist
]

subprocess.run(ffmpeg_cmd)

print("HLS playlist generated!")