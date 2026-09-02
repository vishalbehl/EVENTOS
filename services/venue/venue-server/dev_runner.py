"""
Auto-port finding development server runner for Venue Server.
Detects if the preferred port is in use and automatically binds to the next available port.
"""

import argparse
import os
import socket
import subprocess
import sys
import time
import uvicorn

# Ensure UTF-8 output on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def reclaim_port(port: int) -> None:
    """If preferred port is occupied on Windows, kill any stale owning process."""
    if sys.platform == "win32":
        try:
            cmd = f'Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess'
            res = subprocess.run(["powershell", "-Command", cmd], capture_output=True, text=True, timeout=3)
            pids = [p.strip() for p in res.stdout.splitlines() if p.strip().isdigit() and int(p.strip()) != 0 and int(p.strip()) != os.getpid()]
            for pid in set(pids):
                subprocess.run(["powershell", "-Command", f"Stop-Process -Id {pid} -Force -ErrorAction SilentlyContinue"], capture_output=True, timeout=3)
            if pids:
                time.sleep(0.6)
        except Exception:
            pass


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    # 1. Probe if any process is actively listening on this port
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.2)
            if s.connect_ex((host, port)) == 0:
                return False  # Port is actively occupied
    except Exception:
        pass

    # 2. Probe exclusive bind without SO_REUSEADDR
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            s.bind((host, port))
            return True
    except OSError:
        return False


def find_available_port(start_port: int, max_attempts: int = 50, host: str = "127.0.0.1") -> int:
    reclaim_port(start_port)
    for p in range(start_port, start_port + max_attempts):
        if is_port_available(p, host):
            return p
    raise RuntimeError(f"Could not find an available port starting from {start_port} (tried {max_attempts} ports)")


def main():
    parser = argparse.ArgumentParser(description="Venue Server Auto-Port Dev Runner")
    parser.add_argument("--port", type=int, default=8001, help="Preferred starting port (default: 8001)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--app", type=str, default="app.main:app", help="FastAPI application import string")
    parser.add_argument("--reload", action="store_true", default=True, help="Enable automatic code reloading")
    args = parser.parse_args()

    selected_port = find_available_port(args.port, host=args.host)

    if selected_port != args.port:
        print(f"\n==================================================")
        print(f"[WARN] Preferred port {args.port} is in use / busy.")
        print(f"[INFO] Automatically selected next available port: {selected_port}")
        print(f"[START] Venue Server starting on http://{args.host}:{selected_port}")
        print(f"==================================================\n")
    else:
        print(f"\n==================================================")
        print(f"[START] Venue Server starting on http://{args.host}:{selected_port}")
        print(f"==================================================\n")

    uvicorn.run(
        args.app,
        host=args.host,
        port=selected_port,
        reload=args.reload,
        reload_dirs=["app"] if args.reload else None,
    )


if __name__ == "__main__":
    main()
