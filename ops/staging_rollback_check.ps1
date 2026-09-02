param(
  [Parameter(Mandatory = $true)][string]$RollbackImage
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root 'docker-compose.staging.yml'
$override = Join-Path $root '.staging-rollback.override.yml'
$compose = @('compose','--env-file','.env.staging','-f',$composeFile,'-f',$override)

function Wait-BackendHealthy([int]$timeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    $container = (& docker compose --env-file .env.staging -f $composeFile ps -q backend).Trim()
    if ($container) {
      $running = (& docker inspect -f '{{.State.Running}}' $container).Trim()
      $health = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $container).Trim()
      if ($running -eq 'true' -and ($health -eq 'healthy' -or $health -eq 'none')) { return }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Backend did not become healthy within ${timeoutSeconds}s"
}

Push-Location $root
try {
  docker image inspect $RollbackImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Rollback image does not exist locally: $RollbackImage" }

  @"
services:
  backend:
    image: $RollbackImage
    build: null
  workers:
    image: $RollbackImage
    build: null
"@ | Set-Content -LiteralPath $override -Encoding UTF8

  docker compose --env-file .env.staging -f $composeFile config --quiet | Out-Null
  & docker @compose up -d --no-build backend workers
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the rollback image' }
  Wait-BackendHealthy
  $health = Invoke-WebRequest http://127.0.0.1:8001/health -UseBasicParsing
  if ($health.StatusCode -ne 200) { throw 'Rollback image health endpoint failed' }
  Write-Output "rollback_image_health=passed image=$RollbackImage"
}
finally {
  Remove-Item -LiteralPath $override -Force -ErrorAction SilentlyContinue
  & docker compose --env-file .env.staging -f $composeFile up -d --force-recreate backend workers | Out-Null
  Wait-BackendHealthy
  Write-Output 'rollback_restore=current-staging-image'
  Pop-Location
}
