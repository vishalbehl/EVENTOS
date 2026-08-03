from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_template_version import EmailTemplateVersion
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.notifications.services.email_template_studio_service import (
    designer_enabled_for_event,
    list_effective_templates,
    validate_designer_payload,
)
from app.modules.notifications.services.email_renderer import render_template, substitute_registered_context
from tests.conftest import activate_event_for_test, auth_headers


def document(text: str = "News from {{EventName}}") -> dict:
    return {
        "root": {"type": "EmailLayout", "data": {"childrenIds": ["copy"]}},
        "copy": {"type": "Text", "data": {"props": {"text": text}}},
    }


def test_designer_validation_rejects_unsafe_blocks_and_unknown_variables():
    plain = validate_designer_payload(
        designer_json=document(),
        body_html="<p>News from {{EventName}}</p>",
        subject="{{EventName}} update",
        template_type="custom",
        target_type="speaker",
    )
    assert plain == "News from {{EventName}}"

    with pytest.raises(HTTPException) as unsafe:
        validate_designer_payload(
            designer_json={**document(), "bad": {"type": "Script", "data": {}}},
            body_html="<p>Safe</p>",
            subject="Update",
            template_type="custom",
            target_type="speaker",
        )
    assert unsafe.value.detail["code"] == "UNSUPPORTED_EMAIL_BLOCKS"

    with pytest.raises(HTTPException) as unknown_variable:
        validate_designer_payload(
            designer_json=document("{{SecretField}}"),
            body_html="<p>{{SecretField}}</p>",
            subject="Update",
            template_type="custom",
            target_type="speaker",
        )
    assert unknown_variable.value.detail["code"] == "UNSUPPORTED_EMAIL_VARIABLES"


def test_schema_v4_roles_lists_tables_and_responsive_values_are_validated():
    schema_v4 = document()
    schema_v4["copy"]["data"].update({
        "editorRole": "MANAGED_LIST",
        "editorSchemaVersion": 4,
        "editorMetadata": {
            "items": ["First", "Second"],
            "responsiveStyle": {"mobile": {"padding": {"top": 8, "right": 12}}},
        },
    })
    validate_designer_payload(
        designer_json=schema_v4,
        body_html="<ul><li>First</li><li>Second</li></ul>",
        subject="Update",
        template_type="custom",
        target_type="speaker",
    )

    invalid_role = document()
    invalid_role["copy"]["data"].update({
        "editorRole": "SOCIAL_ICON",
        "editorSchemaVersion": 4,
        "editorMetadata": {},
    })
    with pytest.raises(HTTPException) as mismatch:
        validate_designer_payload(
            designer_json=invalid_role,
            body_html="<p>Invalid</p>",
            subject="Update",
            template_type="custom",
            target_type="speaker",
        )
    assert mismatch.value.detail["code"] == "INVALID_EMAIL_ROLE_NODE"

    invalid_padding = document()
    invalid_padding["copy"]["data"].update({
        "editorRole": "MANAGED_LIST",
        "editorSchemaVersion": 4,
        "editorMetadata": {"items": ["Item"], "responsiveStyle": {"mobile": {"padding": {"top": 999}}}},
    })
    with pytest.raises(HTTPException) as padding:
        validate_designer_payload(
            designer_json=invalid_padding,
            body_html="<ul><li>Item</li></ul>",
            subject="Update",
            template_type="custom",
            target_type="speaker",
        )
    assert padding.value.detail["code"] == "INVALID_EMAIL_RESPONSIVE_PADDING"


def test_registered_repeaters_are_bounded_and_context_safe():
    source = "{{#each Speakers limit=2}}<a href=\"{{Speaker.ImageUrl}}\">{{Speaker.Name}}</a>{{/each}}"
    rendered = substitute_registered_context(source, {
        "Speakers": [
            {"Name": "<b>Ada</b>", "ImageUrl": "javascript:alert(1)"},
            {"Name": "Grace & Lin", "ImageUrl": "https://example.com/grace.png"},
            {"Name": "Ignored", "ImageUrl": "https://example.com/ignored.png"},
        ]
    })
    assert "&lt;b&gt;Ada&lt;/b&gt;" in rendered
    assert "javascript:" not in rendered
    assert "Grace &amp; Lin" in rendered
    assert "Ignored" not in rendered

    with pytest.raises(ValueError):
        substitute_registered_context("{{#each Secrets limit=2}}{{Secret.Value}}{{/each}}", {"Secrets": []})


def test_locked_eventos_branding_is_server_injected_once_and_policy_controlled():
    rendered, plain = render_template("<html><body><p>Hello</p></body></html>", {})
    assert rendered.count('data-eventos-branding="locked"') == 1
    assert "In collaboration with EventOS" in rendered
    assert "In collaboration with EventOS" in plain

    tampered, _ = render_template(rendered.replace("In collaboration with EventOS", "EventOS"), {})
    assert tampered.count('data-eventos-branding="locked"') == 1

    disabled, _ = render_template("<p>Hello</p>", {}, branding_policy={"enabled": False})
    assert 'data-eventos-branding="locked"' not in disabled


@pytest.mark.asyncio
async def test_event_customization_is_copy_on_write_and_published(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    await activate_event_for_test(db, event)
    fragment = await client.post(
        f"/api/v1/events/{event.id}/notifications/email-components",
        headers={**auth_headers(organizer), "Idempotency-Key": f"fragment-{uuid.uuid4()}"},
        json={
            "name": "Speaker card", "stable_key": "speaker-card", "component_kind": "SECTION",
            "category": "saved", "document_fragment": {
                "rootIds": ["card"], "nodes": {"card": {"type": "Container", "data": {"props": {"childrenIds": []}}}},
            }, "preview_metadata": {},
        },
    )
    assert fragment.status_code == 201, fragment.text
    listed_fragments = await client.get(
        f"/api/v1/events/{event.id}/notifications/email-components", headers=auth_headers(organizer),
    )
    assert listed_fragments.status_code == 200, listed_fragments.text
    assert any(item["stable_key"] == "speaker-card" for item in listed_fragments.json())
    platform = EmailTemplate(
        scope_type="PLATFORM",
        stable_key="general-announcement",
        name="General announcement",
        template_type="custom",
        target_type="speaker",
        subject="{{EventName}} news",
        body_html="<p>Platform {{EventName}}</p>",
        body_text="Platform {{EventName}}",
        designer_json=document("Platform {{EventName}}"),
        is_default=True,
        created_by=organizer.id,
    )
    db.add(platform)
    await db.flush()
    published = EmailTemplateVersion(
        template_id=platform.id,
        version_number=1,
        lifecycle_state="PUBLISHED",
        subject=platform.subject,
        body_html=platform.body_html,
        body_text=platform.body_text,
        designer_json=platform.designer_json,
        editor_schema_version=1,
        created_by=organizer.id,
        published_by=organizer.id,
    )
    db.add(published)
    await db.flush()
    platform.current_published_version_id = published.id
    await db.commit()

    seeded = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        target_type="speaker",
        designer_enabled=True,
    )
    assert [row.id for row, _ in seeded] == [platform.id]

    enabled, _ = await designer_enabled_for_event(
        db, event.organization_id, event.id, organizer.id
    )
    after_capability = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        target_type="speaker",
        designer_enabled=enabled,
    )
    assert [row.id for row, _ in after_capability] == [platform.id]

    listed = await client.get(
        f"/api/v1/events/{event.id}/notifications/template-studio",
        headers=auth_headers(organizer),
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()[0]["effective_origin"] == "PLATFORM"
    assert listed.json()[0]["editable"] is True

    saved = await client.put(
        f"/api/v1/events/{event.id}/notifications/template-studio/{platform.id}/draft",
        headers={
            **auth_headers(organizer),
            "If-Match": "1",
            "Idempotency-Key": f"studio-{uuid.uuid4()}",
        },
        json={
            "name": "Event announcement",
            "subject": "{{EventName}} event news",
            "body_html": "<p>Event {{EventName}}</p>",
            "designer_json": document("Event {{EventName}}"),
            "editor_schema_version": 1,
        },
    )
    assert saved.status_code == 200, saved.text
    event_family_id = uuid.UUID(saved.json()["id"])
    assert event_family_id != platform.id
    assert saved.json()["scope_type"] == "EVENT"
    assert saved.json()["lifecycle_state"] == "DRAFT"

    publish = await client.post(
        f"/api/v1/events/{event.id}/notifications/template-studio/{event_family_id}/publish",
        headers={
            **auth_headers(organizer),
            "If-Match": str(saved.json()["version"]),
            "Idempotency-Key": f"studio-{uuid.uuid4()}",
        },
        json={"reason": "Approved for this event launch"},
    )
    assert publish.status_code == 200, publish.text
    assert publish.json()["lifecycle_state"] == "PUBLISHED"
    await db.refresh(platform)
    assert platform.body_html == "<p>Platform {{EventName}}</p>"

    effective = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        target_type="speaker",
        designer_enabled=True,
    )
    chosen = next(row for row, _ in effective if row.stable_key == "general-announcement")
    assert chosen.id == event_family_id


@pytest.mark.asyncio
async def test_no_designer_entitlement_resolves_platform_only(
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    platform = EmailTemplate(
        scope_type="PLATFORM", stable_key="fallback", name="Fallback", template_type="custom",
        target_type="speaker", subject="Fallback", body_html="<p>Fallback</p>", designer_json=document(),
        is_default=True, created_by=organizer.id, current_published_version_id=uuid.uuid4(),
    )
    event_override = EmailTemplate(
        scope_type="EVENT", event_id=event.id, stable_key="fallback", name="Override", template_type="custom",
        target_type="speaker", subject="Override", body_html="<p>Override</p>", designer_json=document(),
        is_default=False, created_by=organizer.id, current_published_version_id=uuid.uuid4(),
    )
    db.add_all([platform, event_override])
    await db.flush()
    effective = await list_effective_templates(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        target_type="speaker",
        designer_enabled=False,
    )
    assert [(row.id, origin) for row, origin in effective] == [(platform.id, "PLATFORM")]
