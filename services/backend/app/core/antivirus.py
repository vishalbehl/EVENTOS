"""Small, provider-neutral antivirus boundary for background file processing."""
from __future__ import annotations

import os
import shlex
import socket
import subprocess
import tempfile
from dataclasses import dataclass
from collections.abc import Iterable

from app.config import settings


@dataclass(frozen=True)
class ScanResult:
    status: str  # clean, infected, unavailable
    signature: str | None = None


def scan_bytes(payload: bytes) -> ScanResult:
    """Scan bytes with the configured command, if one is available.

    The command is deployment configuration, never user input.  A ClamAV
    command should accept a file path and return 0 for clean, 1 for infected.
    """
    command = (settings.ANTIVIRUS_COMMAND or "").strip()
    if not command:
        return ScanResult("unavailable")

    if command.startswith(("tcp://", "clamd://")):
        return _scan_with_clamd(payload, command)

    return scan_chunks((payload,))


def scan_chunks(chunks: Iterable[bytes]) -> ScanResult:
    """Scan bounded chunks without requiring the complete object in memory."""
    command = (settings.ANTIVIRUS_COMMAND or "").strip()
    if not command:
        return ScanResult("unavailable")
    if command.startswith(("tcp://", "clamd://")):
        return _scan_chunks_with_clamd(chunks, command)

    path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="conf-platform-scan-", delete=False) as handle:
            for chunk in chunks:
                handle.write(chunk)
            path = handle.name
        result = subprocess.run(
            [*shlex.split(command), path],
            capture_output=True,
            text=True,
            timeout=settings.ANTIVIRUS_TIMEOUT_SECONDS,
            check=False,
        )
        if result.returncode == 0:
            return ScanResult("clean")
        if result.returncode == 1:
            signature = (result.stdout or result.stderr or "").strip()[:200] or None
            return ScanResult("infected", signature)
        return ScanResult("unavailable")
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return ScanResult("unavailable")
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass


def _scan_with_clamd(payload: bytes, endpoint: str) -> ScanResult:
    return _scan_chunks_with_clamd((payload,), endpoint)


def _scan_chunks_with_clamd(chunks: Iterable[bytes], endpoint: str) -> ScanResult:
    """Use clamd's INSTREAM protocol without writing uploaded bytes to disk."""
    address = endpoint.split("://", 1)[1]
    host, separator, port_text = address.rpartition(":")
    if not separator or not host:
        return ScanResult("unavailable")
    try:
        port = int(port_text)
    except ValueError:
        return ScanResult("unavailable")

    try:
        with socket.create_connection((host, port), timeout=settings.ANTIVIRUS_TIMEOUT_SECONDS) as client:
            client.settimeout(settings.ANTIVIRUS_TIMEOUT_SECONDS)
            client.sendall(b"zINSTREAM\0")
            for chunk in chunks:
                if not chunk:
                    continue
                client.sendall(len(chunk).to_bytes(4, "big"))
                client.sendall(chunk)
            client.sendall(b"\0\0\0\0")
            response = client.recv(4096).decode("utf-8", errors="replace").strip().rstrip("\0")
        if response.endswith("OK"):
            return ScanResult("clean")
        if response.endswith("FOUND"):
            return ScanResult("infected", response[:200])
        return ScanResult("unavailable")
    except (OSError, ValueError):
        return ScanResult("unavailable")
