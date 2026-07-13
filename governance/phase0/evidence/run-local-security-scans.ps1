[CmdletBinding()]
param(
    [string]$ApiTargetUrl,
    [string]$ContainerImage,
    [switch]$SkipNpmAudit
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outputDir = Join-Path $PSScriptRoot "scans\$timestamp"
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$summary = [System.Collections.Generic.List[object]]::new()

function Add-Result {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Tool,
        [string]$Output,
        [string]$Notes
    )

    $summary.Add([pscustomobject]@{
        scan = $Name
        status = $Status
        tool = $Tool
        output = $Output
        notes = $Notes
    })
}

function Invoke-EvidenceCommand {
    param(
        [string]$Name,
        [string]$Tool,
        [string[]]$Arguments,
        [string]$OutputFile
    )

    $command = Get-Command $Tool -ErrorAction SilentlyContinue
    if (-not $command) {
        Add-Result $Name "SKIPPED" $Tool "" "Tool is not installed or not on PATH."
        return
    }

    $path = Join-Path $outputDir $OutputFile
    $versionPath = Join-Path $outputDir "$OutputFile.version.txt"
    try {
        & $Tool --version *> $versionPath
    } catch {
        $_ | Out-String | Set-Content -Path $versionPath -Encoding utf8
    }

    try {
        & $Tool @Arguments *> $path
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
        $status = if ($exitCode -eq 0) { "PASS" } else { "FINDINGS" }
        Add-Result $Name $status $Tool $path "Exit code: $exitCode"
    } catch {
        $_ | Out-String | Set-Content -Path $path -Encoding utf8
        Add-Result $Name "ERROR" $Tool $path $_.Exception.Message
    }
}

Push-Location $repoRoot
try {
    $gitCommit = (& git rev-parse HEAD 2>$null)
    $metadata = [ordered]@{
        generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
        repository_root = $repoRoot
        git_commit = $gitCommit
        git_worktree_dirty = [bool](& git status --porcelain 2>$null)
        operator = [Environment]::UserName
        machine = [Environment]::MachineName
    }
    $metadata | ConvertTo-Json | Set-Content (Join-Path $outputDir "metadata.json") -Encoding utf8

    Invoke-EvidenceCommand "Secret scan" "gitleaks" @(
        "detect", "--source", ".", "--no-banner", "--redact",
        "--report-format", "json", "--report-path", (Join-Path $outputDir "gitleaks-report.json")
    ) "gitleaks-console.txt"

    Invoke-EvidenceCommand "Python SAST" "bandit" @(
        "-r", "services/backend/app", "services/workers", "services/venue-server/app",
        "-f", "json", "-o", (Join-Path $outputDir "bandit-report.json")
    ) "bandit-console.txt"

    Invoke-EvidenceCommand "Multi-language SAST" "semgrep" @(
        "scan", "--config", "auto", "--json", "--output", (Join-Path $outputDir "semgrep-report.json"),
        "services", "apps"
    ) "semgrep-console.txt"

    Invoke-EvidenceCommand "Python dependency scan" "pip-audit" @(
        "--format", "json", "--output", (Join-Path $outputDir "pip-audit-report.json")
    ) "pip-audit-console.txt"

    if (-not $SkipNpmAudit) {
        $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
        if ($npm) {
            $npmPath = Join-Path $outputDir "npm-audit-report.json"
            try {
                & npm.cmd audit --json *> $npmPath
                $npmExit = $LASTEXITCODE
                $npmStatus = if ($npmExit -eq 0) { "PASS" } else { "FINDINGS" }
                Add-Result "JavaScript dependency scan" $npmStatus "npm audit" $npmPath "Exit code: $npmExit"
            } catch {
                $_ | Out-String | Set-Content -Path $npmPath -Encoding utf8
                Add-Result "JavaScript dependency scan" "ERROR" "npm audit" $npmPath $_.Exception.Message
            }
        } else {
            Add-Result "JavaScript dependency scan" "SKIPPED" "npm audit" "" "npm.cmd is not installed or not on PATH."
        }
    } else {
        Add-Result "JavaScript dependency scan" "SKIPPED" "npm audit" "" "Skipped by caller."
    }

    if ($ContainerImage) {
        Invoke-EvidenceCommand "Container image scan" "trivy" @(
            "image", "--format", "json", "--output", (Join-Path $outputDir "trivy-image-report.json"),
            $ContainerImage
        ) "trivy-console.txt"
    } else {
        Add-Result "Container image scan" "SKIPPED" "trivy" "" "Pass -ContainerImage with an immutable tag or digest."
    }

    if ($ApiTargetUrl) {
        $zap = Get-Command "zap-baseline.py" -ErrorAction SilentlyContinue
        if ($zap) {
            Invoke-EvidenceCommand "API/DAST baseline" "zap-baseline.py" @(
                "-t", $ApiTargetUrl, "-J", (Join-Path $outputDir "zap-report.json"),
                "-w", (Join-Path $outputDir "zap-report.md")
            ) "zap-console.txt"
        } else {
            Add-Result "API/DAST baseline" "SKIPPED" "zap-baseline.py" "" "ZAP is not installed or not on PATH."
        }
    } else {
        Add-Result "API/DAST baseline" "SKIPPED" "OWASP ZAP" "" "Pass -ApiTargetUrl for an authorized local or staging target."
    }
} finally {
    Pop-Location
}

$summary | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $outputDir "summary.json") -Encoding utf8
$summary | Format-Table -AutoSize | Out-String | Set-Content (Join-Path $outputDir "summary.txt") -Encoding utf8
$summary | Format-Table -AutoSize
Write-Output "Evidence directory: $outputDir"

if ($summary.status -contains "ERROR") { exit 2 }
if (($summary.status -contains "FINDINGS") -or ($summary.status -contains "SKIPPED")) { exit 1 }
exit 0

