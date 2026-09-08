param([switch]$Run)
$ErrorActionPreference = 'Stop'
if (!$Run) {
  Write-Output 'Dry run. Pass -Run to execute reversible dependency restart checks.'
  Write-Output 'Checks: Redis, PostgreSQL, MinIO, ClamAV, and worker restart/readiness recovery.'
  exit 0
}
$compose = @('compose','--env-file','.env.staging','-f','docker-compose.staging.yml')
function Wait-ServiceReady([string]$service, [int]$timeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    $container = (& docker @compose ps -q $service).Trim()
    if ($container) {
      $running = (& docker inspect -f '{{.State.Running}}' $container).Trim()
      $health = (& docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $container).Trim()
      if ($running -eq 'true' -and ($health -eq 'healthy' -or $health -eq 'none')) {
        return
      }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Service did not recover within ${timeoutSeconds}s: $service"
}

function Assert-ServiceProbe([string]$service) {
  switch ($service) {
    'redis' { if ((docker exec conf-platform-redis-1 redis-cli ping).Trim() -ne 'PONG') { throw 'Redis ping failed' } }
    'postgres' { docker exec conf-platform-postgres-1 pg_isready -U postgres -d eventos_db | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL readiness probe failed' } }
    'minio' { docker exec conf-platform-minio-1 mc ready local | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'MinIO readiness probe failed' } }
    'clamav' { docker exec conf-platform-clamav-1 clamdscan --ping 3:1 localhost:3310 | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'ClamAV probe failed' } }
    {$_ -in @('workers', 'workers-processing', 'workers-legacy')} {
      $names = (& docker @compose ps -q $service).Trim()
      if (!$names) { throw "Celery worker container is missing: $service" }
      # Container health alone cannot prove that Celery recovered its broker
      # connection. Require a live worker response and queue declarations.
      $celeryApp = if ($service -eq 'workers-legacy') { 'workers.celery_app:app' } else { 'app.worker:celery_app' }
      $workerHost = ((docker @compose exec -T $service hostname) -join '').Trim()
      $expectedQueues = @{
        workers = @('critical', 'default', 'notifications')
        'workers-processing' = @('files', 'videos', 'imports', 'search', 'reports', 'reconciliation')
        'workers-legacy' = @('legacy-default', 'legacy-files', 'legacy-videos', 'legacy-imports', 'legacy-search', 'legacy-reports', 'legacy-reconciliation', 'legacy-notifications')
      }
      $deadline = (Get-Date).AddSeconds(60)
      do {
        & docker @compose exec -T $service celery -A $celeryApp inspect ping --destination="celery@$workerHost" --timeout=5 | Out-Null
        if ($LASTEXITCODE -eq 0) {
          $queues = docker @compose exec -T $service celery -A $celeryApp inspect active_queues --destination="celery@$workerHost" --timeout=5 2>$null
          $queueNames = @([regex]::Matches(($queues -join "`n"), "(?m)^\s*\*\s+\{'name': '([^']+)'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
          $expected = @($expectedQueues[$service] | Sort-Object -Unique)
          if ((@($queueNames) -join ',') -eq (@($expected) -join ',')) { return }
        }
        Start-Sleep -Seconds 3
      } while ((Get-Date) -lt $deadline)
      throw "Celery worker ping or queue inspection failed after restart: $service"
    }
  }
}

foreach ($service in @('redis','postgres','minio','clamav','workers','workers-processing','workers-legacy')) {
  & docker @compose restart $service
  if ($LASTEXITCODE -ne 0) { throw "Restart failed: $service" }
  $timeout = if ($service -eq 'clamav') { 240 } else { 90 }
  Wait-ServiceReady $service $timeout
  Assert-ServiceProbe $service
  Write-Output "recovered=$service"
}
Write-Output 'Dependency restart checks passed for Redis, PostgreSQL, MinIO, ClamAV, and all Celery worker pools.'
