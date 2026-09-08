from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_cloud_launcher_uses_docker_backend_and_starts_each_cloud_portal_once():
    source = (ROOT / "devrun.ps1").read_text(encoding="utf-8-sig")

    assert "[string]$BackendMode = 'docker'" in source
    assert "ops\\staging.ps1" in source
    assert "apps/cloud/command-center" in source
    assert "apps/cloud/organiser-portal" in source
    assert "apps/cloud/event-portal" in source
    assert "-Port 3000" in source
    assert "-Port 3001" in source
    assert "-Port 3003" in source
    assert "dev:speaker" not in source
    assert "dev:registration" not in source
    assert "taskkill.exe /PID" in source
    assert "/IM" not in source


def test_cloud_launcher_has_owned_shutdown_and_manual_backend_escape_hatch():
    source = (ROOT / "devrun.ps1").read_text(encoding="utf-8-sig")

    assert "[string]$Action = 'up'" in source
    assert "[ValidateSet('up', 'down')]" in source
    assert "Stop-TrackedCloudProcesses" in source
    assert "staging.ps1') -Action down" in source
    assert "[string]$BackendMode = 'docker'" in source
    assert "if ($BackendMode -eq 'docker')" in source
    assert "uvicorn app.main:app" in source


def test_cloud_next_dev_scripts_use_stable_webpack_mode():
    for app, port in (("command-center", "3000"), ("organiser-portal", "3001"), ("event-portal", "3003")):
        package = (ROOT / "apps" / "cloud" / app / "package.json").read_text(encoding="utf-8-sig")
        assert f'"dev": "next dev --webpack --port {port}"' in package
