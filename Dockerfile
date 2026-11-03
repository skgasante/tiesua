# TieSua backend — isolated container. Build from the repo root.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt "uvicorn[standard]>=0.30"

COPY backend backend

RUN useradd --create-home tiesua && chown -R tiesua /app
USER tiesua

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"

# One worker on purpose: the server-wide Meta budget is in-process
# and must be exact, and demo traffic does not need more.
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
