$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$started = Get-Date
$passed = 0; $failed = 0; $skipped = 0; $blocked = 0
$generatedUploadIdentity = $false
$generatedUploadOrganizationId = $null
$originalTestEmail = $env:STAGING_TEST_EMAIL
$originalTestPassword = $env:STAGING_TEST_PASSWORD
$originalTestEventId = $env:STAGING_TEST_EVENT_ID
$originalDashboardEmail = $env:STAGING_DASHBOARD_EMAIL
$originalDashboardEventId = $env:STAGING_DASHBOARD_EVENT_ID

# Keep credentials out of the shell history while allowing a repeatable local
# release check. The file is ignored and is never echoed by this script.
$testEnvFile = if ($env:STAGING_TEST_ENV_FILE) { $env:STAGING_TEST_ENV_FILE } else { Join-Path $root '.env.staging.test' }
if (Test-Path -LiteralPath $testEnvFile) {
  foreach ($line in Get-Content -LiteralPath $testEnvFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $Matches[1] -notmatch '^(#|$)') {
      $name = $Matches[1]
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      if (-not [Environment]::GetEnvironmentVariable($name)) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
      }
    }
  }
}
if (-not $env:STAGING_DASHBOARD_EVENT_ID -and $env:STAGING_TEST_EVENT_ID) {
  $env:STAGING_DASHBOARD_EVENT_ID = $env:STAGING_TEST_EVENT_ID
}
if (-not $env:STAGING_DASHBOARD_EMAIL -and $env:STAGING_TEST_EMAIL) {
  $env:STAGING_DASHBOARD_EMAIL = $env:STAGING_TEST_EMAIL
}
function Check([string]$name, [scriptblock]$action) {
  try {
    $global:LASTEXITCODE = 0
    & $action
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "command exited with code $LASTEXITCODE" }
    $script:passed++; Write-Output "PASS $name"
  }
  catch { $script:failed++; Write-Output "FAIL $name :: $($_.Exception.Message)" }
}
Push-Location $root
try {
  if (-not $env:STAGING_TEST_EMAIL -and -not $env:STAGING_TEST_PASSWORD -and -not $env:STAGING_TEST_EVENT_ID) {
    $suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
    # example.com is reserved for documentation but accepted by the email
    # validator; .invalid is intentionally rejected by email-validator.
    $env:STAGING_TEST_EMAIL = "release-$suffix@example.com"
    $env:STAGING_TEST_PASSWORD = "Release-$suffix-Upload-2026!"
    $seedOutput = & docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps `
      -e "STAGING_TEST_EMAIL=$env:STAGING_TEST_EMAIL" `
      -e "STAGING_TEST_PASSWORD=$env:STAGING_TEST_PASSWORD" `
      backend python /runtime-ops/create_staging_test_identity.py
    if ($LASTEXITCODE -ne 0) { throw 'Could not create ephemeral authenticated upload identity' }
    $seedText = $seedOutput -join "`n"
    $eventMatch = [regex]::Match($seedText, '(?m)^event_id=(?<id>[0-9a-fA-F-]{36})$')
    $orgMatch = [regex]::Match($seedText, '(?m)^organization_id=(?<id>[0-9a-fA-F-]{36})$')
    if (-not $eventMatch.Success -or -not $orgMatch.Success) { throw 'Ephemeral identity seed returned no event or organization id' }
    $env:STAGING_TEST_EVENT_ID = $eventMatch.Groups['id'].Value
    $generatedUploadOrganizationId = $orgMatch.Groups['id'].Value
    $generatedUploadIdentity = $true
    if (-not $env:STAGING_DASHBOARD_EVENT_ID) {
      $env:STAGING_DASHBOARD_EVENT_ID = $env:STAGING_TEST_EVENT_ID
    }
    if (-not $env:STAGING_DASHBOARD_EMAIL) {
      $env:STAGING_DASHBOARD_EMAIL = $env:STAGING_TEST_EMAIL
    }
    Write-Output 'generated_authenticated_upload_identity=ready'
  }
  Check 'compose config' { docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet }
  Check 'migration graph' { docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend python ops/validate_migration_chain.py }
  Check 'backend compilation' { docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend python -m compileall -q app }
  Check 'service health' { $items = docker compose --env-file .env.staging -f docker-compose.staging.yml ps --format '{{.Service}} {{.Status}}'; if (($items | Select-String 'unhealthy|Exited|Restarting').Count) { throw 'unhealthy service detected' } }
  # Caddy resolves Docker service names at startup. Recreate it after backend
  # rollouts so the HTTPS smoke test never uses a stale container address.
  Check 'proxy route refresh' { docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --force-recreate caddy | Out-Null }
  Check 'certificate and HTTPS' { & powershell -ExecutionPolicy Bypass -File .\ops\verify_caddy_certificate.ps1 | Out-Null }
  Check 'Prometheus ready' { if ((Invoke-WebRequest http://127.0.0.1:9090/-/ready -UseBasicParsing).StatusCode -ne 200) { throw 'Prometheus is not ready' } }
  Check 'Alertmanager ready' { if ((Invoke-WebRequest http://127.0.0.1:9093/-/ready -UseBasicParsing).StatusCode -ne 200) { throw 'Alertmanager is not ready' } }
  Check 'Prometheus alert rules' {
    $rules = Invoke-RestMethod http://127.0.0.1:9090/api/v1/rules
    if ($rules.status -ne 'success' -or -not $rules.data.groups) { throw 'Prometheus alert rules are not loaded' }
  }
  Check 'Redis role topology' {
    & docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T backend python /runtime-ops/staging_redis_topology_probe.py | Out-Null
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Redis role topology probe failed' }
  }
  Check 'Alertmanager alert routing' {
    & powershell -ExecutionPolicy Bypass -File .\ops\staging_alert_test.ps1
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Alertmanager did not accept the controlled test alert' }
  }
  Check 'shared backend contracts' {
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_phase3_7_contracts.py tests/test_production_primitives.py tests/test_read_path_write_contract.py tests/test_resource_command_service.py tests/test_operations_command_service.py tests/test_operations_query_service.py tests/test_participant_query_service_contract.py tests/test_capacity_query_service.py tests/test_deployment_command_service.py tests/test_inventory_command_service.py tests/test_pricing_command_boundary.py tests/test_pricing_simulation_query_contract.py tests/test_operations_concurrency.py tests/test_celery_task_policy_contract.py tests/test_repository_contract.py tests/test_platform_flag_command_boundary.py tests/test_billing_activation_command_boundary.py tests/test_billing_activation_query_service.py tests/test_billing_activation_route_boundary.py tests/test_billing_subscription_route_boundary.py tests/test_analytics_export_command_boundary.py tests/test_webhook_command_boundary.py tests/test_presentation_file_command_boundary.py tests/test_presentation_upload_command_boundary.py tests/test_announcement_command_boundary.py tests/test_venue_attendance_command_boundary.py tests/test_access_review_command_boundary.py tests/test_audit_export_command_boundary.py tests/test_technology_service_command_boundary.py tests/test_abstract_configuration_command_boundary.py tests/test_technology_service_query_boundary.py tests/test_platform_communications_command_boundary.py tests/test_abstract_submission_command_boundary.py tests/test_abstract_reviewer_command_boundary.py tests/test_abstract_assignment_command_boundary.py tests/test_abstract_decision_command_boundary.py tests/test_abstract_publication_command_boundary.py tests/test_abstract_bulk_publication_command_boundary.py tests/test_abstract_review_command_boundary.py
  }
  Check 'tenant and security gates' {
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_abstract_attachment_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_search_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_support_ticket_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_support_ticket_update_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_support_comment_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_support_attachment_completion_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_support_attachment_upload_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_identity_admin_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_identity_mfa_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_identity_status_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_identity_role_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_domain_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_status_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_feature_override_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_team_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_member_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_organization_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_billing_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_approval_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_notification_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_custom_field_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_location_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_location_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_team_create_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_document_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_event_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_report_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_import_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_security_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organization_governance_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_security_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_branding_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps backend pytest -q tests/test_organiser_attention_command_boundary.py
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm backend pytest -q tests/test_phase0_security_invariants.py tests/test_phase1_rls_foundation.py tests/test_tenant_runtime_boundaries.py
  }
  Check 'authentication gates' {
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm backend pytest -q tests/test_auth.py
  }
  Check 'upload and task reliability gates' {
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm backend pytest -q tests/test_upload_command_contract.py tests/test_upload_retry_state.py tests/test_import_task_idempotency.py tests/test_task_policy.py tests/test_task_failure_contract.py tests/test_operations_control.py tests/test_operations_control_boundary.py tests/test_srr_command_service.py tests/test_capacity_command_service.py
  }
  if ($env:STAGING_TEST_EMAIL -and $env:STAGING_TEST_PASSWORD -and $env:STAGING_TEST_EVENT_ID) {
    Check 'authenticated upload and antivirus' {
      # Forward credentials only to this ephemeral container process. They are
      # intentionally absent from compose files, logs, and repository files.
      # The API generates the presigned URL.  On the Windows staging host the
      # host-run client must therefore use the host-facing MinIO endpoint;
      # changing S3 variables only on a one-off test container would not alter
      # the already-running API container's generated URL.
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
  } else {
    $blocked++; Write-Output 'BLOCKED_EXTERNAL authenticated upload credentials/event are not configured'
  }
  Check 'backup restore' { & powershell -ExecutionPolicy Bypass -File .\ops\staging_backup_verify.ps1 | Out-Null }
  Check 'database evidence' { docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm backend python ops/database_evidence.py --require-pg-stat-statements | Out-Null }
  Check 'bounded load' {
    # Container recreation and Python connection-pool initialization can make
    # the first request slow. Warm the real backend endpoint before measuring.
    Start-Sleep -Seconds 3
    1..5 | ForEach-Object {
      $response = Invoke-WebRequest http://127.0.0.1:8001/health -UseBasicParsing
      if ($response.StatusCode -ne 200) { throw 'backend warm-up failed' }
    }
    docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm backend python ops/load_test.py http://backend:8000/health --requests 100 --concurrency 10 --max-error-rate 0 --max-p95-ms 1000 | Out-Null
  }
  if ($env:STAGING_DASHBOARD_EVENT_ID) {
    Check 'authenticated dashboard load' {
      $email = if ($env:STAGING_DASHBOARD_EMAIL) { $env:STAGING_DASHBOARD_EMAIL } else { 'local-upload-test@example.com' }
      docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T backend python /runtime-ops/staging_dashboard_load.py $env:STAGING_DASHBOARD_EVENT_ID --email $email --requests 20 --concurrency 2 --warmup-requests 1 --max-p95-ms 1000 | Out-Null
    }
  } else {
    $skipped++; Write-Output 'SKIPPED authenticated dashboard load STAGING_DASHBOARD_EVENT_ID is not configured'
  }
  Check 'dependency recovery' {
    & powershell -ExecutionPolicy Bypass -File .\ops\staging_failure_checks.ps1 -Run
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'dependency recovery checks failed' }
  }
  Check 'worker crash recovery' {
    & powershell -ExecutionPolicy Bypass -File .\ops\staging_worker_crash_probe.ps1
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'worker crash recovery probe failed' }
  }
  Check 'post-recovery health' {
    $health = Invoke-WebRequest http://127.0.0.1:8001/health -UseBasicParsing
    if ($health.StatusCode -ne 200) { throw 'backend health failed after dependency recovery' }
  }
} finally {
  if ($generatedUploadIdentity -and $generatedUploadOrganizationId) {
    & docker compose --env-file .env.staging -f docker-compose.staging.yml run --rm --no-deps `
      backend python /runtime-ops/cleanup_staging_upload_test.py --organization-id $generatedUploadOrganizationId | Out-Null
  }
  $env:STAGING_TEST_EMAIL = $originalTestEmail
  $env:STAGING_TEST_PASSWORD = $originalTestPassword
  $env:STAGING_TEST_EVENT_ID = $originalTestEventId
  $env:STAGING_DASHBOARD_EMAIL = $originalDashboardEmail
  $env:STAGING_DASHBOARD_EVENT_ID = $originalDashboardEventId
  Pop-Location
}
$duration = ((Get-Date) - $started).TotalSeconds
Write-Output "SUMMARY passed=$passed failed=$failed skipped=$skipped blocked_external=$blocked duration_s=$([math]::Round($duration,1))"
if ($failed -gt 0) { exit 1 }
