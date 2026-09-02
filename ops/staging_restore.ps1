param([Parameter(Mandatory=$true)][string]$DumpFile)
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $DumpFile)) { throw "Dump file not found: $DumpFile" }
$answer = Read-Host "This replaces staging database data. Type RESTORE to continue"
if ($answer -cne 'RESTORE') { throw 'Restore cancelled.' }
$name = [IO.Path]::GetFileName($DumpFile)
& docker cp $DumpFile "conf-platform-postgres-1:/tmp/$name"
& docker exec conf-platform-postgres-1 pg_restore -U postgres -d eventos_db --clean --if-exists --no-owner "/tmp/$name"
& docker exec conf-platform-postgres-1 rm "/tmp/$name"
Write-Output 'PostgreSQL staging restore complete.'
