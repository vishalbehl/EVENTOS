[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [string]$OutputDirectory = "$PSScriptRoot\out",
    [string]$Version = "1.0.0.0",
    [string]$CertificateThumbprint
)

$ErrorActionPreference = "Stop"
$required = @(
    "runtime\python\python.exe",
    "runtime\postgres\bin\pg_ctl.exe",
    "runtime\postgres\bin\initdb.exe",
    "runtime\postgres\bin\psql.exe",
    "runtime\postgres\bin\createdb.exe",
    "runtime\node\node.exe",
    "gateway\caddy.exe",
    "gateway\Caddyfile",
    "services\venue-server\alembic.ini",
    "services\EventosVenueApi.exe",
    "services\EventosVenueUi.exe",
    "services\EventosVenueGateway.exe",
    "ui\server.js"
)
$root = (Resolve-Path -LiteralPath $PayloadRoot).Path
foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $relative))) {
        throw "Payload is incomplete; missing $relative"
    }
}
if ((Get-Item -LiteralPath (Join-Path $root "ui\server.js")).Length -lt 1) {
    throw "Payload is incomplete; ui\\server.js is empty."
}

$wix = Get-Command wix -ErrorAction SilentlyContinue
if (-not $wix) { throw "WiX v4 CLI is required. Install it before building the MSI." }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$harvest = Join-Path $OutputDirectory "payload.wxs"
$msi = Join-Path $OutputDirectory "EventOS-VenueServer-$Version.msi"
& $wix.Source harvest directory $root -o $harvest -dr INSTALLFOLDER -cg PayloadComponents
if ($LASTEXITCODE -ne 0) { throw "WiX harvest failed." }
& $wix.Source build (Join-Path $PSScriptRoot "VenueServer.wxs") $harvest -dVersion=$Version -o $msi
if ($LASTEXITCODE -ne 0) { throw "WiX MSI build failed." }

if ($CertificateThumbprint) {
    $signTool = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if (-not $signTool) { throw "signtool.exe is required when signing is requested." }
    & $signTool.Source sign /sha1 $CertificateThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $msi
    if ($LASTEXITCODE -ne 0) { throw "MSI signing failed." }
} else {
    Write-Warning "MSI was built unsigned. Production release is blocked until the MSI is signed."
}
Write-Output $msi
