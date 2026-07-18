[CmdletBinding()]
param(
    [string]$OutputDir = (Join-Path $PSScriptRoot 'lan-cert')
)

$ErrorActionPreference = 'Stop'

$serverPfx = Join-Path $OutputDir 'ASAdventurer-LAN-Server.pfx'
$passwordFile = Join-Path $OutputDir 'ASAdventurer-LAN-Server.password.txt'
$rootCer = Join-Path $OutputDir 'ASAdventurer-LAN-Root.cer'
$installBat = Join-Path $OutputDir 'Install Certificate on this PC.bat'
$readmeFile = Join-Path $OutputDir 'README.txt'

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

if ((Test-Path $serverPfx) -and (Test-Path $passwordFile) -and (Test-Path $rootCer)) {
    Write-Host '  Existing AS Adventurer LAN certificate found.'
    exit 0
}

$hostName = [System.Net.Dns]::GetHostName()
$ipAddresses = @(
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notmatch '^127\.' -and
            $_.IPAddress -notmatch '^169\.254\.'
        } |
        Select-Object -ExpandProperty IPAddress -Unique
)

$sanEntries = @(
    'DNS=localhost',
    "DNS=$hostName",
    "DNS=$hostName.local",
    'IPAddress=127.0.0.1'
)
foreach ($ip in $ipAddresses) {
    $sanEntries += "IPAddress=$ip"
}
$sanExtension = '2.5.29.17={text}' + ($sanEntries -join '&')

Write-Host "  Creating LAN certificate for $hostName..."
if ($ipAddresses.Count -gt 0) {
    Write-Host ('  Network addresses: ' + ($ipAddresses -join ', '))
}

$rootCert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject 'CN=AS Adventurer LAN Root' `
    -FriendlyName 'AS Adventurer LAN Root' `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -TextExtension @('2.5.29.19={critical}{text}ca=true&pathlength=1') `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(5)

$serverCert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject "CN=$hostName" `
    -FriendlyName 'AS Adventurer LAN Server' `
    -Signer $rootCert `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -TextExtension @(
        '2.5.29.37={text}1.3.6.1.5.5.7.3.1',
        $sanExtension
    ) `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(2)

$passwordBytes = New-Object byte[] 32
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
try {
    $rng.GetBytes($passwordBytes)
} finally {
    $rng.Dispose()
}
$passwordText = ([System.BitConverter]::ToString($passwordBytes)).Replace('-', '').ToLowerInvariant()
$password = ConvertTo-SecureString -String $passwordText -Force -AsPlainText

Export-PfxCertificate `
    -Cert $serverCert `
    -FilePath $serverPfx `
    -Password $password `
    -ChainOption EndEntityCertOnly `
    -Force | Out-Null

Export-Certificate -Cert $rootCert -FilePath $rootCer -Force | Out-Null
Set-Content -LiteralPath $passwordFile -Value $passwordText -Encoding ASCII -NoNewline

# Trust the root for the Windows account running the host application.
Import-Certificate -FilePath $rootCer -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null

@'
@echo off
setlocal
set "CERT=%~dp0ASAdventurer-LAN-Root.cer"
if not exist "%CERT%" (
    echo Certificate file not found: %CERT%
    pause
    exit /b 1
)
echo.
echo Installing the AS Adventurer LAN certificate for this Windows user...
certutil -user -addstore Root "%CERT%"
if errorlevel 1 (
    echo.
    echo Installation failed. Right-click this file and choose Run as administrator,
    echo or double-click the .cer file and install it under Trusted Root Certification Authorities.
    pause
    exit /b 1
)
echo.
echo Certificate installed. Close all browser windows, reopen the HTTPS LAN address,
echo and grant camera or microphone permission when prompted.
pause
'@ | Set-Content -LiteralPath $installBat -Encoding ASCII

@"
AS Adventurer secure LAN certificate
====================================

To enable camera and microphone on a second Windows computer:

1. Copy this entire lan-cert folder to the second computer.
2. Run "Install Certificate on this PC.bat" on that computer.
3. Close all browser windows.
4. Reopen the HTTPS Control Panel address printed by AS Adventurer.
5. Grant camera and microphone permission in the browser.

Keep ASAdventurer-LAN-Server.pfx and its password file private. Only the
ASAdventurer-LAN-Root.cer file is intended to be copied to client computers.

If the host computer's name or IP address changes, delete this folder and
restart LAN mode to generate a replacement certificate, then reinstall the
new root certificate on client computers.
"@ | Set-Content -LiteralPath $readmeFile -Encoding UTF8

Write-Host ''
Write-Host '  Secure LAN certificate created.'
Write-Host "  Root certificate: $rootCer"
Write-Host '  The host account now trusts it.'
Write-Host '  Copy the lan-cert folder to each client computer and run the installer once.'
