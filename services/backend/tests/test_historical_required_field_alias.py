"""Historical alias compatibility must not soften incoming form contracts."""
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.modules.registration.schemas.event_form_contracts import form_document, public_form_projection


@pytest.mark.parametrize("required", [True, False])
def test_stored_alias_preserves_required_semantics_and_upload_limits(required):
    fields = [{"id": "document", "name": "document", "label": "Supporting document", "type": "file",
        "required": required, "validation": {"allowed_file_types": [".pdf"], "max_file_size_mb": 1}}]
    before = deepcopy(fields)
    result = form_document(fields, {}, stored=True)
    assert result["fields"][0]["is_required"] is required
    assert "required" not in result["fields"][0]
    assert result["fields"][0]["validation"] == before[0]["validation"]
    assert fields == before
    assert form_document(result["fields"], result["settings"], stored=True) == result


@pytest.mark.parametrize("value", ["true", "false", 0, 1, None, [], {}])
def test_stored_alias_never_coerces_non_booleans(value):
    with pytest.raises(ValueError, match="historical required flag"):
        form_document([{"id": "x", "type": "text", "required": value}], {}, stored=True)


@pytest.mark.parametrize("legacy,current", [(True, False), (False, True), (True, 1), (False, 0)])
def test_conflicting_historical_flags_are_not_silently_resolved(legacy, current):
    with pytest.raises(ValueError, match="historical required flag"):
        form_document([{"id": "x", "type": "text", "required": legacy, "is_required": current}], {}, stored=True)


@pytest.mark.parametrize("value", [True, False])
def test_matching_explicit_boolean_flags_can_be_canonicalised(value):
    result = form_document([{"id": "x", "type": "text", "required": value, "is_required": value}], {}, stored=True)
    assert result["fields"][0]["is_required"] is value


def test_new_mutations_still_reject_the_legacy_alias():
    with pytest.raises(ValidationError):
        form_document([{"id": "x", "type": "text", "required": True}], {})


def test_legacy_compatibility_does_not_allow_unknown_fields_or_public_defaults():
    with pytest.raises(ValidationError):
        form_document([{"id": "x", "type": "text", "required": True, "custom_js": "not allowed"}], {}, stored=True)
    result = public_form_projection([{"id": "x", "type": "text", "required": True,
        "default_value": "private historical answer"}], {}, event_id=None)
    assert result["fields"][0]["is_required"] is True
    assert "default_value" not in result["fields"][0]
