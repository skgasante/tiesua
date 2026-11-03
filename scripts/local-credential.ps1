# Windows DPAPI encrypts for the current Windows account and computer.
# This file contains code only. The credential lives outside the repository.
function Get-TieSuaCredentialPath {
    if (-not $env:LOCALAPPDATA) { throw 'Windows local application storage is unavailable.' }
    return Join-Path $env:LOCALAPPDATA 'TieSua\Credentials\meta-api-key.dpapi'
}

function Save-TieSuaCredential {
    param([Parameter(Mandatory = $true)][Security.SecureString]$Secret,
          [string]$Path = (Get-TieSuaCredentialPath))
    if ($Secret.Length -eq 0) { throw 'The key was empty. Nothing was saved.' }
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    # Load and update only the discretionary access list. Set-Acl with a
    # newly constructed descriptor can request audit/owner privileges on
    # Windows PowerShell, which ordinary users should not need here.
    $acl = New-Object Security.AccessControl.DirectorySecurity($directory, [Security.AccessControl.AccessControlSections]::Access)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($existingRule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($existingRule) }
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    $directoryInfo = Get-Item -LiteralPath $directory
    if ($directoryInfo.PSObject.Methods['SetAccessControl']) {
        $directoryInfo.SetAccessControl($acl)
    } else {
        [IO.FileSystemAclExtensions]::SetAccessControl($directoryInfo, $acl)
    }
    # ConvertFrom-SecureString without a supplied key uses Windows DPAPI.
    $encrypted = ConvertFrom-SecureString -SecureString $Secret
    $temporary = Join-Path $directory ([Guid]::NewGuid().ToString() + '.tmp')
    try {
        [IO.File]::WriteAllText($temporary, $encrypted, [Text.Encoding]::UTF8)
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        $encrypted = $null
    }
}

function Read-TieSuaCredential {
    param([string]$Path = (Get-TieSuaCredentialPath))
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    return ConvertTo-SecureString -String ([IO.File]::ReadAllText($Path))
}
