# TieSua backend: verification + tutoring API

## Run

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --port 8000
```

Interactive API docs: http://127.0.0.1:8000/docs · Health: `GET /health`

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /v1/sessions` `{problem}` | Start a problem, e.g. `(x+2)/4 = 3`. Returns the verified state. |
| `GET /v1/sessions/{id}` | Current verified state. Invalid steps never overwrite it. |
| `POST /v1/sessions/{id}/step` `{input}` | Classify and verify one learner action. |
| `POST /v1/sessions/{id}/tutor` `{question?}` | Tutoring guidance constrained by the last verdict. |
| `GET /v1/diagnostics` | Safe diagnostics (source, model, latency, verdict). No credentials, no learner text. |

## Step verdicts

`action_type`: operation · resulting_equation · final_answer · question · navigation · incomplete_input.
`verdict`: valid · invalid · incomplete · unsupported · clarification_needed, with an `error_category` only when the mistake is reliably classifiable (e.g. transformation-incorrect, final-answer-incorrect, division-by-zero, operation-incomplete, ambiguous-input).

Equivalence uses exact SymPy arithmetic: difference-ratio and solution-set checks. Learner text is parsed by an allowlisted grammar into explicit SymPy constructs — never `eval`/`sympify` on raw input. Operations that divide by zero or multiply by zero are invalid; dividing by an expression containing x records its restriction; multiplying by such an expression is flagged as possibly introducing extraneous solutions.

## Meta tutoring (server-side only)

Set in the server environment (never in Git, never sent to the browser):

```powershell
$env:MODEL_API_KEY = "..."   # META_API_KEY also accepted
$env:META_MODEL = "muse-spark-1.3-contributor"   # optional
```

Without a key, `/tutor` returns honestly labelled `fallback-scripted` guidance. `TIESUA_TUTOR_MOCK=1` enables a self-identifying mock for tests only. Live responses are validated against the verifier verdict; failures fall back to scripted guidance and are recorded in diagnostics.

## Tests

```powershell
.venv\Scripts\python.exe -m pytest backend\tests -q
```
