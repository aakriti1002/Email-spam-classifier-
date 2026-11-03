# Dockerfile for Render / Container deployment
FROM python:3.11-slim

# Prevent Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies: Tesseract OCR & OpenCV dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download required NLTK data
COPY nltk_setup.py .
RUN python nltk_setup.py

# Copy application source code
COPY . .

# Expose default port
EXPOSE 10000

# Start Gunicorn server
CMD ["sh", "-c", "gunicorn app:app --workers 2 --threads 2 --timeout 120 --bind 0.0.0.0:${PORT:-10000}"]

