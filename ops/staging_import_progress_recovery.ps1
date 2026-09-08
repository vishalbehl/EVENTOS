param([string]$ReportDirectory = 'D:\conf-platform\reports\tasks')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compose = @('compose','--env-file','.env.staging','-f','docker-compose.staging.yml')
New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $ReportDirectory "import-progress-recovery-$stamp.json"
Push-Location $root
try {
  & docker @compose exec -T backend python /runtime-ops/staging_import_progress_probe.py --prepare --output /tmp/import-progress-prepare.json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'could not create disposable import progress checkpoint' }
  $prepareJson = (& docker @compose exec -T backend cat /tmp/import-progress-prepare.json) -join "`n"
  $prepared = $prepareJson | ConvertFrom-Json
  if (-not $prepared.job_id -or -not $prepared.organization_id) { throw 'prepare probe returned no job scope' }

  & docker @compose restart workers-processing | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'processing worker restart failed' }
  $deadline = (Get-Date).AddSeconds(90)
  do {
    & docker @compose exec -T workers-processing celery -A app.worker inspect ping --timeout=5 | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw 'processing worker did not recover after restart' }

  & docker @compose exec -T backend python /runtime-ops/staging_import_progress_probe.py --verify --job-id $prepared.job_id --organization-id $prepared.organization_id --output /tmp/import-progress-verify.json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'durable import progress was not reconstructed after worker restart' }
  $verifyJson = (& docker @compose exec -T backend cat /tmp/import-progress-verify.json) -join "`n"
  $verified = $verifyJson | ConvertFrom-Json
  $result = [ordered]@{ job_id=$prepared.job_id; organization_id=$prepared.organization_id; worker_service='workers-processing'; worker_restarted=$true; observed_progress=$verified.observed.progress; observed_status=$verified.observed.status; passed=$true }
  $result | ConvertTo-Json | Set-Content -LiteralPath $report -Encoding utf8
  $result | ConvertTo-Json
  Write-Output "import_progress_report=$report"
} finally { Pop-Location }
