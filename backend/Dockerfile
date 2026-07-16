FROM python:3.12-slim AS base

# Install system dependencies using pre-built binaries (no compilation needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libpq-dev \
    libmagic1 \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --retries 5 --timeout 100 -r requirements.txt

#  Development stage 
FROM base AS development

COPY . .

ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

#  Production stage 
FROM base AS production

RUN groupadd -r appuser && useradd -r -g appuser appuser

COPY --chown=appuser:appuser . .

ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*", \
     "--access-log"]