"""Problem-bank completion paths. Mirrors src/learn/problems.ts —
keep the two in sync. Each path must complete through the verifier
alone (no tutor), ending in the complete solution set."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

BANK = [
    ("(x+3)/5 = 4", ["multiply both sides by five", "x plus three equals twenty", "x equals seventeen"]),
    ("(x+1)/3 = 5", ["multiply both sides by three", "x plus one equals fifteen", "x equals fourteen"]),
    ("(x+2)/4 = 3", ["multiply both sides by four", "x plus two equals twelve", "x equals ten"]),
    ("(x-3)/2 = 5", ["multiply both sides by two", "x minus three equals ten", "x equals thirteen"]),
    ("x+5 = 12", ["subtract five from both sides", "x equals seven"]),
    ("3x = 15", ["divide both sides by three", "x equals five"]),
    ("x-4 = 9", ["add four to both sides", "x equals thirteen"]),
    ("2(x+1) = 14", ["divide both sides by two", "x plus one equals seven", "x equals six"]),
    ("2x+3 = 11", ["subtract three from both sides", "2x equals eight", "divide both sides by two", "x equals four"]),
    ("(x+6)/3 = 4", ["multiply both sides by three", "x plus six equals twelve", "x equals six"]),
]


@pytest.mark.parametrize("problem,path", BANK)
def test_problem_completes_via_valid_path(problem, path):
    r = client.post("/v1/sessions", json={"problem": problem})
    assert r.status_code == 201, r.text
    sid = r.json()["session_id"]
    body = {}
    for text in path:
        resp = client.post(f"/v1/sessions/{sid}/step", json={"input": text})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["verdict"] == "valid", f"{problem} step {text!r}: {body}"
    assert body["state"]["solved"] is True, f"{problem} did not solve via {path}"
