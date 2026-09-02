[CmdletBinding()]
param(
    [string]$InstallRoot = "$env:ProgramFiles\Eventos\VenueServer",
    [string]$DataRoot = "$env:ProgramData\Eventos\VenueServer",
    [switch]$PurgeData
)

$ErrorActionPreference = "Stop"
foreach ($service in @("EventosVenueGateway", "EventosVenueUi", "EventosVenueApi")) {
    $wrapper = "$InstallRoot\services\$service.exe"
    if (Test-Path -LiteralPath $wrapper) {
        & $wrapper stop 2>$null
        & $wrapper uninstall 2>$null
    }
}
Stop-Service -Name EventosVenuePostgres -ErrorAction SilentlyContinue
& "$InstallRoot\runtime\postgres\bin\pg_ctl.exe" unregister -N EventosVenuePostgres 2>$null
Get-NetFirewallRule -DisplayName "Eventos Venue Server HTTPS" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($PurgeData) {
    $resolved = [IO.Path]::GetFullPath($DataRoot)
    $expected = [IO.Path]::GetFullPath("$env:ProgramData\Eventos\VenueServer")
    if ($resolved -ne $expected) { throw "Refusing to purge an unexpected data path: $resolved" }
    Remove-Item -LiteralPath $resolved -Recurse -Force
} else {
    Write-Host "Venue data was preserved at $DataRoot"
}
