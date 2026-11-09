"""Replay preserves committed response metadata without weakening projection."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest

from app.modules.registration.application.template_commands import catalogue_projection
from app.modules.registration.schemas.form_builder import FormTemplateResponse


def response(**changes):
    return FormTemplateResponse(id=uuid.uuid4(), name="Stored receipt source", slug="stored-receipt",
        category_key="registration", category_name="Exact committed category label", scope_type="GLOBAL",
        is_default=False, is_system=True, is_active=True, version=2, fields=[],
        settings=changes.pop("settings", {}), created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc), **changes)


def test_receipt_metadata_is_preserved_without_mutating_the_stored_projection():
    stored = response(preview_image_url="https://untrusted.invalid/private-object")
    original = stored.model_dump(mode="json")
    projected = catalogue_projection(stored)
    assert projected is not stored and projected.category_name == stored.category_name
    assert projected.preview_image_url is None
    assert stored.model_dump(mode="json") == original


def test_receipt_type_does_not_bypass_nested_document_validation():
    with pytest.raises(HTTPException) as denied:
        catalogue_projection(response(settings={"custom_js": "unapproved legacy script"}))
    assert denied.value.status_code == 409
    assert denied.value.detail["code"] == "TEMPLATE_DOCUMENT_RECONCILIATION_REQUIRED"
