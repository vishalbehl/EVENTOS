param(
  [ValidateSet('up', 'down')]
  [string]$Action = 'up',
  [ValidateSet('docker', 'manual')]
  [string]$BackendMode = 'docker',
  [switch]$Build,
  [switch]$NoFrontends
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path ${env:TEMP} 'conf-platform-runtime'
$logRoot = Join-Path $runtimeRoot 'logs'
$stateFile = Join-Path $runtimeRoot 'cloud-processes.json'

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

function Stop-TrackedCloudProcesses {
  if (-not (Test-Path -LiteralPath $stateFile)) { return }

  try {
    $tracked = @(Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json)
    foreach ($entry in $tracked) {
      if ($entry.process_id) {
        & taskkill.exe /PID ([int]$entry.process_id) /T /F 2>$null | Out-Null
      }
    }
  } finally {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
  }
}

function Start-CloudFrontend {
  param(
    [string]$Name,
    [string]$Workspace,
    [int]$Port
  )

  $stdout = Join-Path $logRoot "$Name.stdout.log"
  $stderr = Join-Path $logRoot "$Name.stderr.log"
  $command = "Set-Location -LiteralPath '$root'; npm.cmd --workspace '$Workspace' run dev"
  $process = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

  return [pscustomobject]@{
    name = $Name
    port = $Port
    process_id = $process.Id
    stdout = $stdout
    stderr = $stderr
  }
}

Stop-TrackedCloudProcesses

if ($Action -eq 'down') {
  if ($BackendMode -eq 'docker') {
    & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $root 'ops\staging.ps1') -Action down
    if ($LASTEXITCODE -ne 0) {
      throw 'Docker staging shutdown failed.'
    }
  }
  Write-Host 'Cloud platform stopped.' -ForegroundColor Green
  exit 0
}

$manual = @()
if ($BackendMode -eq 'docker') {
  $stagingArgs = @('-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'ops\staging.ps1'), '-Action', 'up')
  if ($Build) { $stagingArgs += '-Build' }
  & powershell.exe @stagingArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker staging could not start. Start Docker Desktop and run devrun.ps1 again.'
  }
} else {
  $backend = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-NoExit', '-Command', "Set-Location -LiteralPath '$root\services\backend'; .\.venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --reload --port 8000") `
    -WorkingDirectory $root `
    -WindowStyle Normal `
    -PassThru
  $worker = Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-NoExit', '-Command', "Set-Location -LiteralPath '$root\services\backend'; .\.venv\Scripts\Activate.ps1; python -m celery -A app.worker worker --loglevel=info -P solo") `
    -WorkingDirectory $root `
    -WindowStyle Normal `
    -PassThru
  $manual = @(
    [pscustomobject]@{ name = 'backend-manual'; port = 8000; process_id = $backend.Id },
    [pscustomobject]@{ name = 'worker-manual'; port = 0; process_id = $worker.Id }
  )
}

$frontends = @()
if (-not $NoFrontends) {
  # The event portal is a single application. Speaker and registration are
  # routes within it and must never be launched as duplicate port owners.
  $frontends += Start-CloudFrontend -Name 'command-center' -Workspace 'apps/cloud/command-center' -Port 3000
  $frontends += Start-CloudFrontend -Name 'organiser-portal' -Workspace 'apps/cloud/organiser-portal' -Port 3001
  $frontends += Start-CloudFrontend -Name 'event-portal' -Workspace 'apps/cloud/event-portal' -Port 3003
}

$trackedProcesses = @($manual) + @($frontends)
$trackedProcesses | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $stateFile -Encoding utf8

Write-Host 'Cloud platform started.' -ForegroundColor Green
if ($BackendMode -eq 'docker') {
  Write-Host 'Backend: Docker staging on http://127.0.0.1:8000' -ForegroundColor Cyan
} else {
  Write-Host 'Backend: manual development server on http://127.0.0.1:8000' -ForegroundColor Cyan
}
if (-not $NoFrontends) {
  Write-Host 'Command Center: http://127.0.0.1:3000' -ForegroundColor Cyan
  Write-Host 'Organiser Portal: http://127.0.0.1:3001' -ForegroundColor Cyan
  Write-Host 'Event Portal: http://127.0.0.1:3003' -ForegroundColor Cyan
  Write-Host "Frontend logs: $logRoot" -ForegroundColor DarkGray
}
