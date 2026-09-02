"""
Auto-port finding development server runner for Cloud Backend.
Detects if the preferred port is in use and automatically binds to the next available port.
"""

import argparse
import socket
import sys
import uvicorn

# Ensure UTF-8 output on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


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
    for p in range(start_port, start_port + max_attempts):
        if is_port_available(p, host):
            return p
    raise RuntimeError(f"Could not find an available port starting from {start_port} (tried {max_attempts} ports)")


def main():
    parser = argparse.ArgumentParser(description="Cloud Backend Auto-Port Dev Runner")
    parser.add_argument("--port", type=int, default=8000, help="Preferred starting port (default: 8000)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--app", type=str, default="app.main:app", help="FastAPI application import string")
    parser.add_argument("--reload", action="store_true", default=True, help="Enable automatic code reloading")
    args = parser.parse_args()

    selected_port = find_available_port(args.port, host=args.host)

    if selected_port != args.port:
        print(f"\n==================================================")
        print(f"[WARN] Preferred port {args.port} is in use / busy.")
        print(f"[INFO] Automatically selected next available port: {selected_port}")
        print(f"[START] Cloud Backend starting on http://{args.host}:{selected_port}")
        print(f"==================================================\n")
    else:
        print(f"\n==================================================")
        print(f"[START] Cloud Backend starting on http://{args.host}:{selected_port}")
        print(f"==================================================\n")

    uvicorn.run(args.app, host=args.host, port=selected_port, reload=args.reload)


if __name__ == "__main__":
    main()
