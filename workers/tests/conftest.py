# workers/tests/conftest.py
"""
Pytest configuration for workers tests.

Strategy:
  - No real Redis / DB / R2 needed for unit tests.
  - Celery runs in ALWAYS_EAGER mode (synchronous execution in-process).
  - All external calls (S3, DB, HTTP) are mocked with pytest-mock / unittest.mock.
  - No Docker required for local dev.
"""

from __future__ import annotations

import os
import sys

import pytest

# Ensure workers package is importable
sys.path.insert(0, str(__file__.replace("tests/conftest.py", "..")))

# ── Celery eager mode ─────────────────────────────────────────

@pytest.fixture(autouse=True)
def celery_eager(monkeypatch):
    """
    Force Celery to execute tasks synchronously in the same process.
    This means .delay() / .apply_async() block and return results immediately.
    """
    from workers.celery_app import app
    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True
    yield
    app.conf.task_always_eager = False
