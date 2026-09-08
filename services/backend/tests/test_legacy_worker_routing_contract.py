"""Contracts for routing compatibility task families to the legacy worker."""

from __future__ import annotations


def test_backend_routes_legacy_task_families_to_isolated_queues():
    from app.worker import celery_app

    routes = celery_app.conf.task_routes
    expected = {
        "file_tasks": "legacy-files",
        "video_tasks": "legacy-videos",
        "import_tasks": "legacy-imports",
        "report_tasks": "legacy-reports",
        "notification_tasks": "legacy-notifications",
        "sync_tasks": "legacy-default",
        "search_tasks": "legacy-search",
    }
    for family, queue in expected.items():
        assert routes[f"workers.tasks.{family}.*"]["queue"] == queue


def test_backend_declares_legacy_queues_without_mixing_application_queues():
    from app.worker import celery_app

    configured = set(celery_app.conf.task_queues)
    assert {"legacy-files", "legacy-videos", "legacy-imports", "legacy-reports"} <= configured
    assert {"files", "videos", "imports", "reports"} <= configured
