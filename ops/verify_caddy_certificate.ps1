$ErrorActionPreference = 'Stop'
$cert = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like '*Caddy Local Authority*' -and $_.NotAfter -gt (Get-Date) } | Select-Object -First 1
if (!$cert) { throw 'Caddy development root certificate is not trusted or has expired.' }
$response = $null
$lastError = $null
for ($attempt = 1; $attempt -le 5; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri https://localhost:8443/health -UseBasicParsing -TimeoutSec 5
    break
  } catch {
    $lastError = $_
    if ($attempt -lt 5) { Start-Sleep -Seconds 2 }
  }
}
if ($null -eq $response) { throw "HTTPS health check failed after 5 attempts: $($lastError.Exception.Message)" }
if ($response.StatusCode -ne 200) { throw "HTTPS health check returned $($response.StatusCode)." }
Write-Output "Caddy certificate trusted: $($cert.Thumbprint)"
Write-Output "HTTPS health: $($response.StatusCode)"
