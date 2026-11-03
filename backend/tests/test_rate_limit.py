import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.main import app

client = TestClient(app)


def test_tutor_rate_limit_returns_429(monkeypatch):
    main_module._TUTOR_HITS.clear()
    monkeypatch.setenv("TIESUA_TUTOR_RATE_PER_MIN", "2")
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)
    r = client.post("/v1/sessions", json={"problem": "(x+2)/4 = 3"})
    sid = r.json()["session_id"]
    assert client.post(f"/v1/sessions/{sid}/tutor", json={}).status_code == 200
    assert client.post(f"/v1/sessions/{sid}/tutor", json={}).status_code == 200
    third = client.post(f"/v1/sessions/{sid}/tutor", json={})
    assert third.status_code == 429
    assert "verified work is safe" in third.json()["detail"]
