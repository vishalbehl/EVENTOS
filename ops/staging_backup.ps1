param([string]$OutputRoot = 'D:\conf-platform\backups')
$ErrorActionPreference = 'Stop'
$envFile = Get-Content -LiteralPath '.env.staging' | Where-Object { $_ -match '^([^#][^=]*)=(.*)$' }
foreach ($line in $envFile) { $parts = $line -split '=', 2; [Environment]::SetEnvironmentVariable($parts[0], $parts[1]) }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$pgDir = Join-Path $OutputRoot "postgres\$stamp"
$minioDir = Join-Path $OutputRoot "minio\$stamp"
New-Item -ItemType Directory -Force -Path $pgDir,$minioDir | Out-Null
& docker exec conf-platform-postgres-1 pg_dump -U postgres -d eventos_db -Fc -f "/tmp/eventos-$stamp.dump"
& docker cp "conf-platform-postgres-1:/tmp/eventos-$stamp.dump" (Join-Path $pgDir 'eventos_db.dump')
& docker exec conf-platform-postgres-1 rm "/tmp/eventos-$stamp.dump"
$mcConfig = Join-Path $minioDir 'mc-config'
New-Item -ItemType Directory -Force -Path $mcConfig | Out-Null
$objectsRoot = Join-Path $minioDir 'objects'
New-Item -ItemType Directory -Force -Path $objectsRoot | Out-Null
$requiredBuckets = @('presentations', 'posters', 'thumbnails', 'imports', 'assets', 'exports', 'event-branding', 'quarantine')
foreach ($bucket in $requiredBuckets) {
  # mc mirror omits empty buckets; retain their namespace in the backup.
  New-Item -ItemType Directory -Force -Path (Join-Path $objectsRoot $bucket) | Out-Null
}
& docker run --rm --network conf-platform_default -v "${minioDir}:/backup" -v "${mcConfig}:/root/.mc" minio/mc:latest alias set staging http://minio:9000 $env:MINIO_ROOT_USER $env:MINIO_ROOT_PASSWORD
& docker run --rm --network conf-platform_default -v "${minioDir}:/backup" -v "${mcConfig}:/root/.mc" minio/mc:latest mirror --overwrite staging /backup/objects
$objectsRoot = Join-Path $minioDir 'objects'
$objectFiles = @(Get-ChildItem -LiteralPath $objectsRoot -Recurse -File)
$objectsRootPrefix = $objectsRoot.TrimEnd([char]92, [char]47) + [char]92
$manifest = foreach ($file in $objectFiles) {
  $relative = $file.FullName.Substring($objectsRootPrefix.Length).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  [PSCustomObject]@{
    key = $relative
    size_bytes = [int64]$file.Length
    sha256 = $hash
  }
}
@{
  created_at = (Get-Date).ToUniversalTime().ToString('o')
  object_count = $objectFiles.Count
  total_size_bytes = [int64](($objectFiles | Measure-Object -Property Length -Sum).Sum)
  objects = @($manifest)
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $minioDir 'manifest.json') -Encoding UTF8
Write-Output "Backup complete: $OutputRoot\$stamp"
