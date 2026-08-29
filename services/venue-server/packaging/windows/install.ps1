[CmdletBinding()]
param(
    [string]$InstallRoot = "$env:ProgramFiles\Eventos\VenueServer",
    [string]$DataRoot = "$env:ProgramData\Eventos\VenueServer",
    [int]$HttpsPort = 443
)

$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Venue Server installation requires an elevated PowerShell session."
}

$required = @(
    "$InstallRoot\runtime\python\python.exe",
    "$InstallRoot\runtime\postgres\bin\pg_ctl.exe",
    "$InstallRoot\runtime\node\node.exe",
    "$InstallRoot\gateway\caddy.exe",
    "$InstallRoot\services\venue-server\alembic.ini",
    "$InstallRoot\ui\server.js"
)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required appliance component is missing: $path" }
}

New-Item -ItemType Directory -Force -Path $DataRoot, "$DataRoot\content", "$DataRoot\backups", "$DataRoot\logs", "$DataRoot\postgres", "$DataRoot\certificates" | Out-Null

function New-Secret([int]$Bytes) {
    $buffer = New-Object byte[] $Bytes
    [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$dbPassword = New-Secret 32
$existingEnvPath = "$DataRoot\venue.env"
function Get-ExistingEnvValue([string]$Name) {
    if (-not (Test-Path -LiteralPath $existingEnvPath)) { return $null }
    $line = Get-Content -LiteralPath $existingEnvPath -ErrorAction SilentlyContinue |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=(.*)$" } | Select-Object -First 1
    if ($line -and $line -match "^$([regex]::Escape($Name))=(.*)$") { return $Matches[1] }
    return $null
}
$existingDbPassword = Get-ExistingEnvValue "VENUE_DATABASE_PASSWORD"
if (-not $existingDbPassword) {
    $existingDatabaseUrl = Get-ExistingEnvValue "DATABASE_URL"
    if ($existingDatabaseUrl -and $existingDatabaseUrl -match "eventos_venue:([^@]+)@") {
        $existingDbPassword = $Matches[1]
    }
}
if ($existingDbPassword) { $dbPassword = $existingDbPassword }
$postgresSecretPath = "$DataRoot\postgres-admin.secret"
if (Test-Path -LiteralPath $postgresSecretPath) {
    $securePassword = Get-Content -LiteralPath $postgresSecretPath | ConvertTo-SecureString
    $credential = New-Object System.Management.Automation.PSCredential("postgres", $securePassword)
    $postgresAdminPassword = $credential.GetNetworkCredential().Password
} else {
    $postgresAdminPassword = New-Secret 32
    ConvertTo-SecureString $postgresAdminPassword -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $postgresSecretPath -Encoding ascii
}
$venueKey = Get-ExistingEnvValue "VENUE_AUTH_KEY"
if (-not $venueKey) { $venueKey = New-Secret 32 }
$authSecret = Get-ExistingEnvValue "VENUE_AUTH_SECRET"
if (-not $authSecret) { $authSecret = New-Secret 48 }
$cloudApiUrl = Get-ExistingEnvValue "CLOUD_API_URL"
if (-not $cloudApiUrl) { $cloudApiUrl = "https://api.example.invalid" }
$cloudApiKey = Get-ExistingEnvValue "CLOUD_API_KEY"
$cloudDeviceKey = Get-ExistingEnvValue "CLOUD_DEVICE_KEY"
$corsOrigins = Get-ExistingEnvValue "CORS_ORIGINS"
if (-not $corsOrigins) { $corsOrigins = "https://venue.local,https://127.0.0.1" }
$publicBaseUrl = Get-ExistingEnvValue "PUBLIC_BASE_URL"
if (-not $publicBaseUrl) { $publicBaseUrl = "https://venue.local" }
$envPath = "$DataRoot\venue.env"
@"
DEPLOYMENT_PROFILE=production
HOST=127.0.0.1
PORT=8001
DATABASE_URL=postgresql+asyncpg://eventos_venue:$dbPassword@127.0.0.1:5432/eventos_venue
VENUE_AUTH_KEY=$venueKey
VENUE_AUTH_SECRET=$authSecret
CORS_ORIGINS=$corsOrigins
PUBLIC_BASE_URL=$publicBaseUrl
VENUE_CA_CERT_PATH=$DataRoot\caddy-data\caddy\pki\authorities\local\root.crt
CLOUD_API_URL=$cloudApiUrl
CONTENT_STORAGE_BACKEND=filesystem
CLOUD_API_KEY=$cloudApiKey
CLOUD_DEVICE_KEY=$cloudDeviceKey
REDIS_URL=
VENUE_DATABASE_PASSWORD=$dbPassword
"@ | Set-Content -LiteralPath $envPath -Encoding utf8NoBOM

$acl = Get-Acl -LiteralPath $envPath
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "Allow")))
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule("BUILTIN\Administrators", "FullControl", "Allow")))
Set-Acl -LiteralPath $envPath -AclObject $acl

$pgData = "$DataRoot\postgres"
$pgBin = "$InstallRoot\runtime\postgres\bin"
if (-not (Test-Path -LiteralPath "$pgData\PG_VERSION")) {
    $passwordFile = "$DataRoot\postgres-admin-password.tmp"
    Set-Content -LiteralPath $passwordFile -Value $postgresAdminPassword -Encoding ascii -NoNewline
    & "$pgBin\initdb.exe" -D $pgData -U postgres --pwfile=$passwordFile --auth=scram-sha-256 --encoding=UTF8
    Remove-Item -LiteralPath $passwordFile -Force
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed." }
    Add-Content -LiteralPath "$pgData\postgresql.conf" -Value "`nlisten_addresses = '127.0.0.1'`nport = 5432`npassword_encryption = 'scram-sha-256'`n"
    & "$pgBin\pg_ctl.exe" register -N EventosVenuePostgres -D $pgData -S auto
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL service registration failed." }
}
Start-Service -Name EventosVenuePostgres
$env:PGPASSWORD = $postgresAdminPassword
& "$pgBin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE eventos_venue LOGIN PASSWORD '$dbPassword'"
if ($LASTEXITCODE -ne 0) {
    & "$pgBin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE eventos_venue PASSWORD '$dbPassword'"
}
& "$pgBin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='eventos_venue'" | ForEach-Object { $databaseExists = $_.Trim() }
if ($databaseExists -ne "1") {
    & "$pgBin\createdb.exe" -h 127.0.0.1 -U postgres -O eventos_venue eventos_venue
    if ($LASTEXITCODE -ne 0) { throw "Venue database creation failed." }
}
$env:PGPASSWORD = $null

$env:DATABASE_URL = "postgresql+asyncpg://eventos_venue:$dbPassword@127.0.0.1:5432/eventos_venue"
$env:DEPLOYMENT_PROFILE = "production"
$env:VENUE_AUTH_KEY = $venueKey
$env:VENUE_AUTH_SECRET = $authSecret
Push-Location "$InstallRoot\services\venue-server"
& "$InstallRoot\runtime\python\python.exe" -m alembic -c alembic.ini upgrade head
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "Venue database migration failed." }

foreach ($service in @("EventosVenueApi", "EventosVenueUi", "EventosVenueGateway")) {
    $wrapper = "$InstallRoot\services\$service.exe"
    if (-not (Test-Path -LiteralPath $wrapper)) { throw "Windows service wrapper missing: $wrapper" }
    & $wrapper install
    if ($LASTEXITCODE -ne 0) { throw "Failed to install Windows service $service." }
    & $wrapper start
}

function Wait-HttpReady([string]$Uri, [string]$Name, [int]$Attempts = 30) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw "$Name did not become ready at $Uri. Check the Windows service logs."
}

Wait-HttpReady "http://127.0.0.1:8001/readyz" "Venue API"
Wait-HttpReady "http://127.0.0.1:3006/" "Venue UI"
for ($attempt = 1; $attempt -le 30; $attempt++) {
    & curl.exe --fail --silent --show-error --insecure --max-time 3 https://127.0.0.1/ 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -eq 30) { throw "Venue HTTPS gateway did not become ready. Check the Windows service logs." }
    Start-Sleep -Seconds 2
}

if (-not (Get-NetFirewallRule -DisplayName "Eventos Venue Server HTTPS" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Eventos Venue Server HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $HttpsPort -Profile Private | Out-Null
}

Write-Host "Venue Server services installed. Open https://127.0.0.1/setup on this machine."
