"""Isolated real local servers/browser, with process-local credentials only."""
from collections import deque
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from sqlalchemy.engine import make_url
from app.config import settings


def run_browser_proof(*, credentials, event_id, owner, template_ids=(), replacement_category_id=None, detach_source_template_id=None):
    backend = Path(__file__).parents[1]
    root = backend.parents[1]
    frontend = root / "apps/cloud/command-center"
    database = make_url(settings.async_database_url)
    if settings.is_production or database.database != "category_a_rehearsal_20261015" or database.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the approved isolated local browser environment is permitted")
    for port in (18080, 18300):
        with socket.socket() as check:
            if check.connect_ex(("127.0.0.1", port)) == 0:
                raise RuntimeError(f"Port {port} is already owned by another process; it will not be reused or stopped")
    node = shutil.which("node.exe" if sys.platform == "win32" else "node")
    if not node:
        raise RuntimeError("The existing Node runtime is required")
    origin = "http://127.0.0.1:18300"
    api = "http://127.0.0.1:18080"
    output = backend / "test-results/category-a-browser"
    output.mkdir(parents=True, exist_ok=True)
    environment = {**os.environ, "ENVIRONMENT": "development", "ENABLE_DEVELOPMENT_BOOTSTRAP": "false",
        "ENFORCE_PRIVILEGED_MFA": "true",
        "DATABASE_URL_ASYNC": settings.async_database_url,
        "DATABASE_URL_SYNC": database.set(drivername="postgresql+psycopg2").render_as_string(hide_password=False),
        "FERNET_KEY": settings.FERNET_KEY, "CORS_ORIGINS": json.dumps([origin]),
        "COMMAND_CENTER_COOKIE_SECURE": "false", "COMMAND_CENTER_COOKIE_SAMESITE": "lax"}
    environment.pop("MIGRATION_DATABASE_URL_SYNC", None)
    processes = []
    logs = deque(maxlen=300)

    def start(arguments, cwd, env):
        process = subprocess.Popen(arguments, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        processes.append(process)

        def collect():
            for line in process.stdout:
                logs.append(line.rstrip())
        threading.Thread(target=collect, daemon=True).start()
        return process

    def wait_for(url, process, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("An isolated server exited before becoming available")
            try:
                with urlopen(url, timeout=3) as response:
                    if response.status == 200:
                        return
            except (URLError, HTTPError, TimeoutError):
                pass
            time.sleep(0.25)
        raise RuntimeError("An isolated server did not become available within its bounded startup window")

    try:
        server = start([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
            "--port", "18080", "--log-level", "warning"], backend, environment)
        wait_for(api + "/health", server, 120)
        frontend_env = {**os.environ, "NEXT_PUBLIC_API_URL": api, "NEXT_PUBLIC_DISABLE_REALTIME": "1",
            "NEXT_PUBLIC_DEPLOYMENT_PROFILE": "local", "NEXT_DIST_DIR": ".next-category-a-browser"}
        site = start([node, str(root / "node_modules/next/dist/bin/next"), "dev", "--webpack",
            "--hostname", "127.0.0.1", "--port", "18300"], frontend, frontend_env)
        wait_for(origin, site, 240)
        browser_env = {**os.environ, "CATEGORY_A_BROWSER_ORIGIN": origin,
            "CATEGORY_A_BROWSER_EMAIL": credentials[0], "CATEGORY_A_BROWSER_PASSWORD": credentials[1],
            "CATEGORY_A_BROWSER_TOTP": credentials[2], "CATEGORY_A_BROWSER_EVENT": str(event_id),
            "CATEGORY_A_BROWSER_OWNER": str(owner), "CATEGORY_A_BROWSER_OUTPUT": str(output)}
        browser_env["CATEGORY_A_BROWSER_SOURCE_TEMPLATES"] = ",".join(map(str, template_ids))
        browser_env["CATEGORY_A_BROWSER_REPLACEMENT_CATEGORY"] = str(replacement_category_id or "")
        browser_env["CATEGORY_A_BROWSER_DETACH_SOURCE"] = str(detach_source_template_id or "")
        result = subprocess.run([node, "acceptance/category-a-live-reconciliation.mjs"], cwd=frontend,
            env=browser_env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        if result.returncode:
            raise RuntimeError("Real browser acceptance failed: " + result.stderr[-3000:])
        evidence = json.loads(result.stdout.strip().splitlines()[-1])
        evidence["startup_profile"] = "development_restricted_runtime_no_default_seeding"
        evidence["production_startup_verified"] = False
        evidence["screenshots"] = [str(output / f"category-a-review-{stage}.png") for stage in ("before", "after")]
        return evidence
    except Exception as exc:
        # Only diagnostic output; no environment, cookies, token or credentials.
        detail = str(exc) + "\nServer diagnostics:\n" + "\n".join(list(logs)[-15:])
        for secret in (*credentials[1:], settings.FERNET_KEY, database.password):
            if secret:
                detail = detail.replace(secret, "[redacted]")
        raise RuntimeError(detail) from None
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                else:
                    process.terminate()
                process.wait(timeout=15)
