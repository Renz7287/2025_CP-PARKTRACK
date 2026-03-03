FROM python:3.11-slim

# Install ffmpeg and build dependencies via apt — much smaller than Nix
RUN apt-get update && apt-get install -y \
    ffmpeg \
    gcc \
    python3-dev \
    libpq-dev \
    default-libmysqlclient-dev \
    pkg-config \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "parktrack.wsgi", "--workers", "2", "--timeout", "120", "--bind", "0.0.0.0:8000"]