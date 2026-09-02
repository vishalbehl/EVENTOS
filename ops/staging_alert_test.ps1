$ErrorActionPreference = 'Stop'
$alertName = 'LocalProductionLikeTest'
$startsAt = (Get-Date).ToUniversalTime().ToString('o')
$labels = @{ alertname = $alertName; severity = 'info'; source = 'staging-alert-test' }
$send = {
  param([string]$endsAt)
  $payload = @{ labels = $labels; annotations = @{ summary = 'Controlled local alert test' }; startsAt = $startsAt }
  if ($endsAt) { $payload.endsAt = $endsAt }
  $json = @($payload | ConvertTo-Json -Depth 5 -Compress)
  $response = Invoke-WebRequest -Uri http://127.0.0.1:9093/api/v2/alerts -Method Post -ContentType 'application/json' -Body "[$json]" -UseBasicParsing
  if ($response.StatusCode -notin @(200,204)) { throw "Alertmanager rejected test alert: $($response.StatusCode)" }
}
try {
  & $send ''
  $visible = $false
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    $active = @(Invoke-RestMethod http://127.0.0.1:9093/api/v2/alerts)
    if ($active | Where-Object { $_.labels.alertname -eq $alertName -and $_.labels.source -eq 'staging-alert-test' }) {
      $visible = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $visible) { throw 'Alertmanager accepted the alert but did not expose it through its API.' }
  Write-Output 'Alertmanager accepted and exposed the controlled test alert.'
} finally {
  try { & $send ((Get-Date).ToUniversalTime().ToString('o')) } catch { Write-Warning 'Could not resolve the controlled test alert.' }
}
