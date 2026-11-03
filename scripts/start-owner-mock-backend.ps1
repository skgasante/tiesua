$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
$python = Join-Path $project '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'The project Python virtual environment is missing. See backend/README.md.' }
$env:TIESUA_TUTOR_MOCK = '1'
$env:TIESUA_DISABLE_LIVE_AI = '1'
$env:ALLOWED_ORIGINS = 'http://127.0.0.1:5174,http://localhost:5174'
Write-Host 'OWNER ACCEPTANCE: isolated backend 127.0.0.1:8011; mock mode ON; live AI DISABLED.'
Write-Host 'Keep this window open. If the port is in use, stop and choose a different port; do not stop another process.'
& $python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8011
if ($LASTEXITCODE -ne 0) { throw "Isolated backend failed (exit $LASTEXITCODE). Do not use the frontend until this is resolved." }
