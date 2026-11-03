$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
$base = 'http://127.0.0.1:8011'
$markers = @(
  @{ Path = 'src/speech/conversationSession.ts'; Text = 'session.recognition-unavailable' },
  @{ Path = 'src/views/LessonRunner.tsx'; Text = 'speechGeneration' },
  @{ Path = 'src/learn/api.ts'; Text = 'AbortSignal.timeout(20000)' }
)
foreach ($marker in $markers) {
  $source = Get-Content -LiteralPath (Join-Path $project $marker.Path) -Raw
  if (-not $source.Contains($marker.Text)) { throw "Updated Stage 3 source marker missing: $($marker.Path)." }
}
try {
  $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 5
  if ($health.service -ne 'tiesua-verifier') { throw 'Unexpected backend service.' }
  $plan = Invoke-RestMethod -Uri "$base/v1/orchestrate" -Method Post -ContentType 'application/json' -Body '{"text":"acceptance preflight","context":{"screen":"home"}}' -TimeoutSec 5
  if ($plan.source -ne 'mock' -or $null -ne $plan.model) { throw 'Backend is not confirmed mock-only.' }
  $session = Invoke-RestMethod -Uri "$base/v1/sessions" -Method Post -ContentType 'application/json' -Body '{"problem":"x plus two, all over four, equals three"}' -TimeoutSec 5
  if ($session.state.equation_text -ne '(x + 2)/4 = 3') { throw 'Spoken equation grouping did not pass.' }
  $url = "$base/v1/sessions/$($session.session_id)/step"
  $operation = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body '{"input":"multiply by four"}' -TimeoutSec 5
  $bad = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body '{"input":"three times four makes thirteen"}' -TimeoutSec 5
  if ($operation.verdict -ne 'valid' -or $bad.verdict -ne 'invalid' -or $bad.state.equation_text -ne $session.state.equation_text -or -not $bad.state.pending_operation -or $bad.state.solved) { throw 'Verifier safety preflight did not pass.' }
} catch { throw "Mock-backend preflight failed: $($_.Exception.Message). Start the isolated backend in a fresh window; never use the keyed backend for this test." }
$env:VITE_API_BASE = $base
Write-Host 'PREFLIGHT PASSED: Stage 3 source markers, mock source, spoken grouping, and unchanged equation after incorrect arithmetic.'
Write-Host 'Frontend uses current working-tree source at http://127.0.0.1:5174 (strict port). Open this address in Chrome.'
Write-Host 'Keep this window open. If the port is in use, stop; do not stop another process.'
& npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
if ($LASTEXITCODE -ne 0) { throw "Isolated frontend failed (exit $LASTEXITCODE)." }
