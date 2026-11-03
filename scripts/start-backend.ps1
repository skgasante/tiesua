# Starts the TieSua backend, optionally with live Meta tutoring.
# The key is saved with Windows DPAPI outside the repository, and
# decrypted only into the backend process environment. Never print it.
param([int]$Port = 8000, [switch]$SaveKeyOnly, [switch]$ForgetSavedKey)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
. (Join-Path $PSScriptRoot 'local-credential.ps1')

if ($ForgetSavedKey) {
    $credentialPath = Get-TieSuaCredentialPath
    if (Test-Path -LiteralPath $credentialPath) { Remove-Item -LiteralPath $credentialPath -Force }
    Write-Host 'Saved key removed. Already running backends are unchanged.'
    exit 0
}

$hasKey = [bool]$env:MODEL_API_KEY -or [bool]$env:META_API_KEY
if ($hasKey -and ($SaveKeyOnly -or -not (Test-Path -LiteralPath (Get-TieSuaCredentialPath)))) {
    $existingKey = if ($env:MODEL_API_KEY) { $env:MODEL_API_KEY } else { $env:META_API_KEY }
    $secure = ConvertTo-SecureString -String $existingKey -AsPlainText -Force
    $existingKey = $null
    try { Save-TieSuaCredential -Secret $secure } finally { $secure.Dispose(); $secure = $null }
} elseif (-not $hasKey) {
    try {
        $secure = Read-TieSuaCredential
        if ($null -ne $secure) {
            try { $env:MODEL_API_KEY = [System.Net.NetworkCredential]::new('', $secure).Password }
            finally { $secure.Dispose(); $secure = $null }
            Write-Host 'Loaded the saved key from Windows encrypted storage.'
        }
    } catch {
        Write-Warning 'The saved key could not be read. Please enter it again.'
    }
}

if ($SaveKeyOnly -and -not ([bool]$env:MODEL_API_KEY -or [bool]$env:META_API_KEY)) {
    $secure = Read-Host 'Paste the Model API key to save (input hidden)' -AsSecureString
    try { Save-TieSuaCredential -Secret $secure } finally { $secure.Dispose(); $secure = $null }
}
if ($SaveKeyOnly) {
    Write-Host 'Key saved in Windows encrypted storage. No backend started and no API request made.'
    exit 0
}

if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Project environment not found. Create it first:'
    Write-Host '  python -m venv .venv'
    Write-Host '  .venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt'
    exit 1
}

$hasKey = [bool]$env:MODEL_API_KEY -or [bool]$env:META_API_KEY
if (-not $hasKey) {
    $answer = Read-Host 'Enable live Meta tutoring? Type Y to enter a Model API key, or press Enter for scripted guidance only'
    if ($answer -eq 'Y') {
        $secure = Read-Host 'Paste the Model API key (input hidden)' -AsSecureString
        try {
            Save-TieSuaCredential -Secret $secure
            $env:MODEL_API_KEY = [System.Net.NetworkCredential]::new('', $secure).Password
        } finally { $secure.Dispose(); $secure = $null }
        Write-Host 'Key saved in Windows encrypted storage for future launches.'
    }
}

# Presence check only — the value itself is never displayed.
Write-Host "Live Meta key present in this session: $([bool]$env:MODEL_API_KEY -or [bool]$env:META_API_KEY)"
Write-Host "Model: $(if ($env:META_MODEL) { $env:META_MODEL } else { 'muse-spark-1.3-contributor (default)' })"
Write-Host "Starting TieSua backend on http://127.0.0.1:$Port  (Ctrl+C to stop)"
& '.venv\Scripts\python.exe' -m uvicorn backend.app.main:app --port $Port --host 127.0.0.1
