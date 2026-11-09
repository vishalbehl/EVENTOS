"""Authored only. Integration/worker assertions remain a separate release gate."""
import pytest
from fastapi import HTTPException

from app.modules.platform.services.clone_projection import portable_brand_tokens


def test_reference_and_personal_data_free_projection():
    assert portable_brand_tokens({
        "primary_color": "#aabbcc", "color": "#11223344",
        "logo_asset_ref": "foreign/object", "owner_email": "private@example.test",
        "background_color": "url(https://example.test/private)",
        "custom_color": {"organization_id": "foreign"},
        "contact_color": "private@example.test",
    }) == {"primary_color": "#aabbcc", "color": "#11223344"}


@pytest.mark.parametrize("tokens", [None, [], {str(i): "#112233" for i in range(101)}])
def test_invalid_or_unbounded_configuration_is_not_truncated(tokens):
    with pytest.raises(HTTPException) as caught:
        portable_brand_tokens(tokens)
    assert caught.value.status_code == 409
