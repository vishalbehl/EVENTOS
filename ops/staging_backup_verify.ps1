$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
& powershell -ExecutionPolicy Bypass -File (Join-Path $root 'ops/staging_backup.ps1')
$latest = Get-ChildItem -Directory D:\conf-platform\backups\postgres | Sort-Object LastWriteTime | Select-Object -Last 1
$dump = Join-Path $latest.FullName 'eventos_db.dump'
if (!(Test-Path -LiteralPath $dump)) { throw 'PostgreSQL dump was not created.' }
$db = 'restore_verify_' + (Get-Date -Format 'yyyyMMddHHmmss')
try {
  & docker exec conf-platform-postgres-1 psql -U postgres -d postgres -c "CREATE DATABASE $db" | Out-Null
  & docker cp $dump conf-platform-postgres-1:/tmp/verify.dump | Out-Null
  & docker exec conf-platform-postgres-1 pg_restore -U postgres -d $db --no-owner --exit-on-error /tmp/verify.dump
  $tables = (& docker exec conf-platform-postgres-1 psql -U postgres -d $db -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')").Trim()
  if ([int]$tables -lt 1) { throw 'Restored database has no application tables.' }
  Write-Output "postgres_restore=passed tables=$tables"
} finally {
  & docker exec conf-platform-postgres-1 psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $db" | Out-Null
  & docker exec conf-platform-postgres-1 rm -f /tmp/verify.dump | Out-Null
}
$objects = Get-ChildItem -Recurse -File (Join-Path $latest.Parent.Parent.FullName ('minio\' + $latest.Name)) -ErrorAction SilentlyContinue
$minioBackup = Join-Path $latest.Parent.Parent.FullName ('minio\' + $latest.Name)
$manifestPath = Join-Path $minioBackup 'manifest.json'
if (!(Test-Path -LiteralPath $manifestPath)) { throw 'MinIO backup manifest was not created.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$requiredBuckets = @('presentations', 'posters', 'thumbnails', 'imports', 'assets', 'exports', 'event-branding', 'quarantine')
$objectsRoot = Join-Path $minioBackup 'objects'
foreach ($bucket in $requiredBuckets) {
  if (!(Test-Path -LiteralPath (Join-Path $objectsRoot $bucket))) {
    throw "MinIO backup is missing required bucket: $bucket"
  }
}
$backupFiles = @(Get-ChildItem -LiteralPath $objectsRoot -Recurse -File)
if ($backupFiles.Count -ne [int]$manifest.object_count) {
  throw "MinIO manifest object count mismatch: manifest=$($manifest.object_count) actual=$($backupFiles.Count)"
}
foreach ($entry in @($manifest.objects)) {
  $path = Join-Path $objectsRoot ($entry.key -replace '/', '\')
  if (!(Test-Path -LiteralPath $path)) { throw "MinIO backup object is missing: $($entry.key)" }
  $file = Get-Item -LiteralPath $path
  if ([int64]$file.Length -ne [int64]$entry.size_bytes) { throw "MinIO object size mismatch: $($entry.key)" }
  $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $entry.sha256) { throw "MinIO object checksum mismatch: $($entry.key)" }
}
$restoreRoot = Join-Path $minioBackup 'restore-verification'
New-Item -ItemType Directory -Force -Path $restoreRoot | Out-Null
try {
  foreach ($bucket in $requiredBuckets) {
    $source = Get-ChildItem -LiteralPath (Join-Path $objectsRoot $bucket) -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($source) {
      $target = Join-Path $restoreRoot (Join-Path $bucket $source.Name)
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $source.FullName -Destination $target -Force
      $sourceHash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
      $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
      if ($sourceHash -ne $targetHash) { throw "MinIO restore checksum mismatch: $bucket" }
    }
  }
} finally {
  Remove-Item -LiteralPath $restoreRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "minio_backup_files=$($backupFiles.Count) manifest_checksum_verification=passed"
