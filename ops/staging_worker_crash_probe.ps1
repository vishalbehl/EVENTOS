param(
  [int]$TimeoutSeconds = 90,
  [string]$ReportDirectory = 'D:\conf-platform\reports\tasks'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compose = @('compose','--env-file','.env.staging','-f','docker-compose.staging.yml')
New-Item -ItemType Directory -Force -Path $ReportDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $ReportDirectory "worker-crash-$stamp.json"
Push-Location $root
try {
  & docker @compose exec -T workers-processing celery -A app.worker inspect ping --timeout=10 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'processing worker is not responding before crash probe' }

  & docker @compose exec -T backend python /runtime-ops/staging_worker_crash_probe.py --dispatch --delay-seconds 20 --output /tmp/worker-crash-dispatch.json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'could not dispatch crash-probe task' }
  $container = (& docker @compose ps -q backend).Trim()
  $dispatchPath = Join-Path $ReportDirectory "worker-crash-dispatch-$stamp.json"
  docker cp "$container`:/tmp/worker-crash-dispatch.json" $dispatchPath | Out-Null
  $taskId = (Get-Content -LiteralPath $dispatchPath -Raw | ConvertFrom-Json).task_id
  if (-not $taskId) { throw 'crash probe returned no task id' }

  $activeDeadline = (Get-Date).AddSeconds(15)
  $activeOutput = ''
  do {
    $activeOutput = (& docker @compose exec -T workers-processing celery -A app.worker inspect active --timeout=1 2>$null) -join "`n"
    if ($activeOutput -match [regex]::Escape($taskId)) { break }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $activeDeadline)
  if ($activeOutput -notmatch [regex]::Escape($taskId)) { throw 'crash-probe task was not observed active before child termination' }

  $workerContainer = (& docker @compose ps -q workers-processing).Trim()
  # docker top reports host-side PIDs on Docker Desktop; inspect /proc inside
  # the container so the PID passed to kill is valid in the container namespace.
  $processRows = foreach ($pidText in (docker exec $workerContainer sh -lc "ls -1 /proc" | Where-Object { $_ -match '^\d+$' })) {
    $procId = [int]$pidText
    try { $status = docker exec $workerContainer cat "/proc/$procId/status" 2>$null } catch { continue }
    $ppidLine = $status | Where-Object { $_ -match '^PPid:' } | Select-Object -First 1
    if ($ppidLine -match '^PPid:\s+(\d+)') {
      [pscustomobject]@{ Pid = $procId; ParentPid = [int]$Matches[1] }
    }
  }
  $childPids = @($processRows | Where-Object { $_.ParentPid -eq 1 } | Select-Object -ExpandProperty Pid)
  if (-not $childPids) { throw 'no Celery child process was available for controlled termination' }
  $joinedChildPids = $childPids -join ' '
  docker exec $workerContainer sh -c "kill -9 $joinedChildPids 2>/dev/null || true" | Out-Null

  $deadline = (Get-Date).AddSeconds(60)
  do {
    & docker @compose exec -T workers-processing celery -A app.worker inspect ping --timeout=10 | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw 'processing worker did not remain ready after child SIGKILL' }

  & docker @compose exec -T backend python /runtime-ops/staging_worker_crash_probe.py --wait $taskId --timeout $TimeoutSeconds --output /tmp/worker-crash-result.json | Out-Null
  $resultPath = Join-Path $ReportDirectory "worker-crash-result-$stamp.json"
  docker cp "$container`:/tmp/worker-crash-result.json" $resultPath | Out-Null
  $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
  if (-not $result.recovered) { throw "crash-probe task did not recover; state=$($result.state) error=$($result.error_type)" }
  $combined = [ordered]@{
    task_id = $taskId
    worker_service = 'workers-processing'
    queue = 'files'
    worker_child_killed = $true
    worker_service_recovered = $true
    task_recovered = $true
    state = $result.state
    dispatch_report = $dispatchPath
    result_report = $resultPath
  }
  $combined | ConvertTo-Json | Set-Content -LiteralPath $report -Encoding utf8
  $combined | ConvertTo-Json
  Write-Output "worker_crash_report=$report"
} finally {
  Pop-Location
}
