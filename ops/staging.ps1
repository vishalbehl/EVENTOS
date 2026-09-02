param(
  [ValidateSet('up','down','restart','status','logs','migrate','seed','seed-test-identity','seed-load','backup','backup-verify','restore','load','soak','capacity-probe','dashboard-load','queue-isolation','worker-crash','authenticated-upload','redis-topology','db-evidence','db-hot-plans','db-plan-compare','db-badge-plan-compare','failure-checks','rollback-check','verify-certificate','alert-test','release-check')]
  [string]$Action = 'status',
  [string]$DumpFile,
  [ValidateSet('small','large','cross-tenant')][string]$Profile = 'small',
  [string]$Url,
  [ValidateRange(1,10000)][int]$Requests = 100,
  [ValidateRange(1,500)][int]$Concurrency = 10,
  [ValidateRange(0,100)][int]$WarmupRequests = 0,
  [ValidateRange(1,60000)][int]$MaxP95Ms = 1000,
  [ValidateRange(0,100)][double]$MaxErrorRate = 1,
  [ValidateRange(1,3600)][int]$DurationSeconds = 60,
  [ValidateRange(0,60000)][int]$IntervalMs = 2000,
  [ValidateRange(1,20)][int]$HeavyTasks = 3,
  [ValidateRange(0,10)][double]$HeavyDelaySeconds = 2,
  [ValidateRange(1,60000)][int]$CriticalBudgetMs = 1000,
  [string]$RollbackImage,
  [string]$Token,
  [switch]$Build,
  [switch]$Follow,
  [switch]$Run
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compose = @('compose','--env-file','.env.staging','-f','docker-compose.staging.yml')
$loadReportRoot = 'D:\conf-platform\reports\load'
Push-Location $root
try {
  switch ($Action) {
    'up' { $buildArgs = @(); if ($Build) { $buildArgs = @('--build') }; & docker @compose up -d @buildArgs; & docker @compose run --rm backend python -m alembic upgrade head }
    'down' { & docker @compose down }
    'restart' { & docker @compose restart }
    'status' { & docker @compose ps }
    'logs' { if ($Follow) { & docker @compose logs -f --tail=200 } else { & docker @compose logs --tail=200 } }
    'migrate' { & docker @compose run --rm backend python -m alembic upgrade head }
    'seed' { & docker @compose run --rm backend python /runtime-ops/seed_staging.py }
    'seed-test-identity' {
      if (-not $env:STAGING_TEST_EMAIL -or -not $env:STAGING_TEST_PASSWORD) {
        throw 'Set STAGING_TEST_EMAIL and STAGING_TEST_PASSWORD in the process environment before seeding the isolated test identity.'
      }
      # Pass credentials only to the short-lived seed process. The command
      # prints identifiers, never the password, and does not persist secrets.
      & docker @compose run --rm --no-deps `
        -e "STAGING_TEST_EMAIL=$env:STAGING_TEST_EMAIL" `
        -e "STAGING_TEST_PASSWORD=$env:STAGING_TEST_PASSWORD" `
        backend python /runtime-ops/create_staging_test_identity.py
    }
    'seed-load' {
      New-Item -ItemType Directory -Force -Path $loadReportRoot | Out-Null
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $loadReportRoot "fixture-$Profile-$stamp.json"
      # Bind the host report directory into the disposable seed container. A
      # `docker compose run --rm` container is removed immediately, so copying
      # its output from the long-running backend container is unreliable.
      $reportMount = "${loadReportRoot}:/tmp/fixture-output"
      & docker @compose run --rm -v $reportMount backend python /runtime-ops/seed_load_fixture.py --profile $Profile --output "/tmp/fixture-output/fixture-report.json"
      if ($LASTEXITCODE -ne 0) { throw "fixture seed failed for profile $Profile" }
      $containerReport = Join-Path $loadReportRoot 'fixture-report.json'
      if (Test-Path -LiteralPath $containerReport) {
        Move-Item -LiteralPath $containerReport -Destination $report -Force
      }
      if (-not (Test-Path -LiteralPath $report)) {
        throw 'fixture seed completed but its report was not written to the host report directory'
      }
      Write-Output "fixture_report=$report"
    }
    'backup' { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_backup.ps1') }
    'backup-verify' { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_backup_verify.ps1') }
    'restore' { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_restore.ps1') -DumpFile $DumpFile }
    'load' {
      New-Item -ItemType Directory -Force -Path $loadReportRoot | Out-Null
      $target = if ($Url) { $Url } else { 'http://backend:8000/health' }
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $loadReportRoot "load-$stamp.json"
      & docker @compose exec -T backend python /app/ops/load_test.py $target --requests $Requests --concurrency $Concurrency --max-p95-ms $MaxP95Ms --max-error-rate $MaxErrorRate --output "/tmp/load-report.json"
      if ($LASTEXITCODE -ne 0) { throw 'Load test failed its configured budget' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/load-report.json" $report }
      if (-not (Test-Path -LiteralPath $report)) {
        Write-Output 'load report was emitted by the test container but could not be copied to the host report directory'
      } else { Write-Output "load_report=$report" }
    }
    'soak' {
      New-Item -ItemType Directory -Force -Path $loadReportRoot | Out-Null
      $target = if ($Url) { $Url } else { 'http://backend:8000/health' }
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $loadReportRoot "soak-$stamp.json"
      $tokenArgs = @()
      if ($Token) { $tokenArgs = @('--token', $Token) }
      & docker @compose exec -T backend python /runtime-ops/staging_soak_test.py $target --duration-seconds $DurationSeconds --concurrency $Concurrency --interval-ms $IntervalMs --max-p95-ms $MaxP95Ms --max-error-rate $MaxErrorRate @tokenArgs --output "/tmp/soak-report.json"
      if ($LASTEXITCODE -ne 0) { throw 'Soak test failed its configured budget' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/soak-report.json" $report }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Soak test completed but its report could not be copied' }
      Write-Output "soak_report=$report"
    }
    'capacity-probe' {
      New-Item -ItemType Directory -Force -Path $loadReportRoot | Out-Null
      if (-not $Url) { throw 'Set -Url for the capacity probe target.' }
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $loadReportRoot "capacity-$stamp.json"
      $tokenArgs = @()
      if ($Token) { $tokenArgs = @('--token', $Token) }
      & docker @compose exec -T backend python /runtime-ops/staging_capacity_probe.py $Url --requests $Requests --concurrency $Concurrency --max-p95-ms ($MaxP95Ms * 5) --max-rejection-rate 99 --prometheus-url http://prometheus:9090 @tokenArgs --output /tmp/capacity-report.json
      if ($LASTEXITCODE -ne 0) { throw 'Capacity probe failed its protection/server-error budget' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/capacity-report.json" $report }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Capacity probe completed but its report could not be copied' }
      Write-Output "capacity_report=$report"
    }
    'dashboard-load' {
      New-Item -ItemType Directory -Force -Path $loadReportRoot | Out-Null
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $loadReportRoot "dashboard-$stamp.json"
      & docker @compose exec -T backend python /runtime-ops/staging_dashboard_load.py $env:STAGING_DASHBOARD_EVENT_ID --email $env:STAGING_DASHBOARD_EMAIL --base-url http://127.0.0.1:8000 --requests $Requests --concurrency $Concurrency --warmup-requests $WarmupRequests --max-p95-ms $MaxP95Ms --output "/tmp/dashboard-report.json"
      if ($LASTEXITCODE -ne 0) { throw 'Dashboard load test failed its configured budget' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/dashboard-report.json" $report }
      if (Test-Path -LiteralPath $report) { Write-Output "load_report=$report" }
    }
    'queue-isolation' {
      New-Item -ItemType Directory -Force -Path $loadReportRoot | Out-Null
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $loadReportRoot "queue-isolation-$stamp.json"
      & docker @compose exec -T backend python /runtime-ops/staging_queue_isolation_probe.py --heavy-tasks $HeavyTasks --heavy-delay-seconds $HeavyDelaySeconds --critical-budget-ms $CriticalBudgetMs --output /tmp/queue-isolation-report.json
      if ($LASTEXITCODE -ne 0) { throw 'Queue isolation probe exceeded the critical-task latency budget' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/queue-isolation-report.json" $report }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Queue isolation probe completed but its report could not be copied' }
      Write-Output "queue_isolation_report=$report"
    }
    'worker-crash' {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_worker_crash_probe.ps1')
      if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Worker crash recovery probe failed' }
    }
    'authenticated-upload' {
      $python = Join-Path $root 'services\backend\.venv\Scripts\python.exe'
      if (-not (Test-Path -LiteralPath $python)) { $python = 'python' }
      $previousApiUrl = $env:STAGING_API_URL
      $env:STAGING_API_URL = 'http://127.0.0.1:8001'
      try {
        & $python (Join-Path $root 'ops\staging_authenticated_upload_test.py')
      } finally {
        $env:STAGING_API_URL = $previousApiUrl
      }
    }
    'redis-topology' {
      $reportDir = 'D:\conf-platform\reports\redis'
      New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
      $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $reportDir "topology-$timestamp.json"
      & docker @compose exec -T backend python /runtime-ops/staging_redis_topology_probe.py --output /tmp/redis-topology.json
      if ($LASTEXITCODE -ne 0) { throw 'Redis topology probe failed' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/redis-topology.json" $report }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Redis topology probe completed but its report could not be copied' }
      Write-Output "redis_topology_report=$report"
    }
    'db-evidence' {
      $reportDir = 'D:\conf-platform\reports\db'
      New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
      $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $reportDir "database-evidence-$timestamp.json"
      $reportMount = "${reportDir}:/tmp/evidence"
      & docker @compose run --rm -v $reportMount backend python /app/ops/database_evidence.py --require-pg-stat-statements --output /tmp/evidence/database-evidence.json
      if ($LASTEXITCODE -ne 0) { throw 'Database evidence collection failed or pg_stat_statements is unavailable' }
      $containerReport = Join-Path $reportDir 'database-evidence.json'
      if (Test-Path -LiteralPath $containerReport) {
        Move-Item -LiteralPath $containerReport -Destination $report -Force
      }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Database evidence completed but its report was not written' }
      Write-Output "database_evidence_report=$report"
    }
    'db-hot-plans' {
      if (-not $env:STAGING_DASHBOARD_EVENT_ID) { throw 'Set STAGING_DASHBOARD_EVENT_ID to a representative event UUID.' }
      $reportDir = 'D:\conf-platform\reports\db'
      New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
      $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $reportDir "hot-plans-$timestamp.json"
      & docker @compose exec -T backend python /workspace/services/backend/ops/database_hot_query_plans.py --event-id $env:STAGING_DASHBOARD_EVENT_ID --output /tmp/hot-plans.json
      if ($LASTEXITCODE -ne 0) { throw 'Hot-query plan capture failed' }
      $container = (& docker @compose ps -q backend).Trim()
      if ($container) { & docker cp "$container`:/tmp/hot-plans.json" $report }
      if (Test-Path -LiteralPath $report) { Write-Output "hot_query_plan_report=$report" }
    }
    'db-plan-compare' {
      $reportDir = 'D:\conf-platform\reports\db'
      New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
      $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $reportDir "payment-event-plan-compare-$timestamp.json"
      $reportMount = "${reportDir}:/tmp/evidence"
      & docker @compose run --rm -v $reportMount backend python /runtime-ops/staging_payment_event_plan_compare.py --output /tmp/evidence/payment-event-plan-compare.json
      if ($LASTEXITCODE -ne 0) { throw 'Payment-event before/after plan comparison failed' }
      $containerReport = Join-Path $reportDir 'payment-event-plan-compare.json'
      if (Test-Path -LiteralPath $containerReport) { Move-Item -LiteralPath $containerReport -Destination $report -Force }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Payment-event plan comparison completed but its report was not written' }
      Write-Output "payment_event_plan_report=$report"
    }
    'db-badge-plan-compare' {
      if (-not $env:STAGING_DASHBOARD_EVENT_ID) { throw 'Set STAGING_DASHBOARD_EVENT_ID to a representative event UUID.' }
      $reportDir = 'D:\conf-platform\reports\db'
      New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
      $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $report = Join-Path $reportDir "badge-plan-compare-$timestamp.json"
      $reportMount = "${reportDir}:/tmp/evidence"
      & docker @compose run --rm -v $reportMount backend python /runtime-ops/staging_badge_plan_compare.py --event-id $env:STAGING_DASHBOARD_EVENT_ID --output /tmp/evidence/badge-plan-compare.json
      if ($LASTEXITCODE -ne 0) { throw 'Badge before/after plan comparison failed' }
      $containerReport = Join-Path $reportDir 'badge-plan-compare.json'
      if (Test-Path -LiteralPath $containerReport) { Move-Item -LiteralPath $containerReport -Destination $report -Force }
      if (-not (Test-Path -LiteralPath $report)) { throw 'Badge plan comparison completed but its report was not written' }
      Write-Output "badge_plan_report=$report"
    }
    'failure-checks' {
      $failureArgs = @()
      if ($Run) { $failureArgs = @('-Run') }
      & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_failure_checks.ps1') @failureArgs
    }
    'rollback-check' {
      if (-not $RollbackImage) { throw 'Set -RollbackImage to an existing local backend image tag.' }
      & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_rollback_check.ps1') -RollbackImage $RollbackImage
    }
    'verify-certificate' { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/verify_caddy_certificate.ps1') }
    'alert-test' { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_alert_test.ps1') }
    'release-check' { & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_release_check.ps1') }
  }
} finally { Pop-Location }
