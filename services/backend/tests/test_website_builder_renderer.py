from types import SimpleNamespace
import uuid

from app.modules.website_builder.published_runtime import PUBLISHED_RUNTIME_CHECKSUM
from app.modules.website_builder.router import WebsiteFormSubmissionRequest, _changed_instance_ids, _default_platform_template_document, _derive_link_index, _is_legacy_empty_starter, _render_deployment_manifest, _sanitize_uploaded_svg, _serve_preview_page, _validate_document, _validate_form_payload


def _document() -> dict:
    return {
        "schemaVersion": 1,
        "site": {"siteName": "Renderer Conference", "globalCSS": ".custom{display:block}"},
        "pages": [
            {"id": "home", "name": "Home", "slug": "", "isHomePage": True, "rootInstanceId": "root"},
            {"id": "agenda", "name": "Agenda", "slug": "agenda", "isHomePage": False, "rootInstanceId": "agenda-root"},
        ],
        "instances": {
            "root": {
                "id": "root",
                "componentType": "page-root",
                "children": ["hero"],
                "props": {},
                "styles": {},
                "bindings": [],
            },
            "hero": {
                "id": "hero",
                "componentType": "aceternity-aurora-background",
                "parentId": "root",
                "children": ["heading"],
                "props": {"tagName": "section", "attributes": {"class": "wb-ac-component"}},
                "styles": {
                    "desktop": {"padding": "80px"},
                    "tablet": {"padding": "48px"},
                    "mobile": {"padding": "24px"},
                },
                "bindings": [],
            },
            "heading": {
                "id": "heading",
                "componentType": "heading",
                "parentId": "hero",
                "children": [],
                "props": {"tagName": "h1", "content": "Renderer Conference"},
                "styles": {"desktop": {"color": "#ffffff"}},
                "bindings": [],
            },
            "agenda-root": {
                "id": "agenda-root",
                "componentType": "page-root",
                "children": ["agenda-title"],
                "props": {},
                "styles": {},
                "bindings": [],
            },
            "agenda-title": {
                "id": "agenda-title",
                "componentType": "heading",
                "parentId": "agenda-root",
                "children": [],
                "props": {"tagName": "h1", "content": "Agenda"},
                "styles": {},
                "bindings": [],
            },
        },
        "tokens": {"theme": {"primary": "#0ea5e9", "background": "#020617"}},
        "menus": [],
        "assets": [],
        "dataSources": [],
    }


def test_deployment_renderer_keeps_preview_runtime_and_responsive_styles() -> None:
    document = _document()
    site = SimpleNamespace(id=uuid.uuid4(), event_id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Renderer Conference", slug="renderer-conference")
    revision = SimpleNamespace(id=uuid.uuid4(), checksum="revision-checksum")

    manifest = _render_deployment_manifest(document, site, revision)

    assert [page["route"] for page in manifest["pages"]] == ["/", "/agenda"]
    assert [page["artifactPath"] for page in manifest["pages"]] == ["index.html", "agenda/index.html"]
    assert manifest["organizationId"] == str(site.organization_id)
    home_html = manifest["pages"][0]["html"]
    assert "--primary:#0ea5e9" in home_html
    assert '.custom{display:block}' in home_html
    assert '@media (max-width:1024px)' in home_html
    assert '[data-wb-instance-id="hero"]{padding:48px}' in home_html
    assert '@media (max-width:767px)' in home_html
    assert '[data-wb-instance-id="hero"]{padding:24px}' in home_html
    assert 'data-wb-instance-id="heading"' in home_html
    assert "Renderer Conference</h1>" in home_html
    assert 'data-wb-runtime="tabs"' in home_html
    assert manifest["runtime"]["checksum"] == PUBLISHED_RUNTIME_CHECKSUM


def test_publish_validation_rejects_unsafe_custom_content() -> None:
    document = _document()
    document["site"]["globalCSS"] = "@import url(https://example.test/theme.css)"
    document["instances"]["heading"]["props"]["html"] = '<img src="x" onerror="alert(1)">'

    codes = {diagnostic["code"] for diagnostic in _validate_document(document, publish=True)}

    assert "UNSAFE_CUSTOM_CSS" in codes
    assert "UNSAFE_COMPONENT_HTML" in codes


def test_link_index_resolves_pages_and_page_anchors() -> None:
    document = _document()
    document["instances"]["agenda-title"]["props"]["attributes"] = {"id": "keynotes"}
    document["instances"]["heading"]["props"]["attributes"] = {"href": "/agenda#keynotes"}

    links = _derive_link_index(document)

    assert links == [{
        "source_instance_id": "heading",
        "source_page_id": "home",
        "target_type": "page",
        "target_value": "/agenda#keynotes",
        "target_page_id": "agenda",
        "target_anchor_id": "keynotes",
        "status": "OK",
    }]


def test_publish_validation_reports_broken_page_and_anchor_links() -> None:
    document = _document()
    document["instances"]["heading"]["props"]["attributes"] = {"href": "/missing#unknown"}
    document["menus"] = [{
        "id": "primary",
        "name": "Primary",
        "items": [{"type": "anchor", "pageId": "agenda", "anchorId": "missing-anchor"}],
    }]

    codes = {diagnostic["code"] for diagnostic in _validate_document(document, publish=True)}

    assert "BROKEN_PAGE_LINK" in codes
    assert "BROKEN_ANCHOR_LINK" in codes


def test_deployment_manifest_allow_lists_published_form_instances() -> None:
    document = _document()
    document["instances"]["form"] = {
        "id": "form",
        "componentType": "contact-form",
        "parentId": "root",
        "children": [],
        "props": {"tagName": "form", "attributes": {"data-require-consent": "true"}},
        "styles": {},
        "bindings": [],
    }
    document["instances"]["root"]["children"].append("form")
    site = SimpleNamespace(id=uuid.uuid4(), event_id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Renderer Conference", slug="renderer-conference")
    revision = SimpleNamespace(id=uuid.uuid4(), checksum="revision-checksum")

    manifest = _render_deployment_manifest(document, site, revision)

    assert manifest["runtime"]["approvedFormInstances"] == [{
        "instanceId": "form",
        "componentType": "contact-form",
        "requiresConsent": True,
    }]


def test_form_payload_validation_enforces_field_and_size_limits() -> None:
    _validate_form_payload(WebsiteFormSubmissionRequest(component_instance_id="form", payload={"email": "person@example.com"}))

    oversized = WebsiteFormSubmissionRequest(component_instance_id="form", payload={"message": "x" * (10 * 1024 + 1)})
    try:
        _validate_form_payload(oversized)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 413
    else:
        raise AssertionError("Oversized form fields must be rejected")


def test_svg_sanitizer_removes_scripts_events_and_external_references() -> None:
    sanitized = _sanitize_uploaded_svg(
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><a href="javascript:alert(1)"><rect onclick="alert(1)" width="10" height="10"/></a></svg>'
    ).decode("utf-8")

    assert "<script" not in sanitized
    assert "javascript:" not in sanitized
    assert "onclick" not in sanitized
    assert "<rect" in sanitized


def test_conflict_diff_reports_added_removed_and_changed_instances() -> None:
    client_document = _document()
    server_document = _document()
    client_document["instances"]["heading"]["props"]["content"] = "Client title"
    server_document["instances"]["server-only"] = {
        "id": "server-only",
        "componentType": "paragraph",
        "children": [],
        "props": {"content": "Server addition"},
        "styles": {},
        "bindings": [],
    }

    assert _changed_instance_ids(client_document, server_document) == ["heading", "server-only"]


def test_platform_starter_is_a_populated_selectable_document() -> None:
    document = _default_platform_template_document()
    root = document["instances"]["root_home"]

    assert root["children"] == [
        "starter_header",
        "starter_hero",
        "starter_overview",
        "starter_stats",
        "starter_agenda",
        "starter_venue",
        "starter_register",
        "starter_footer",
    ]
    assert document["instances"]["starter_hero"]["children"] == ["starter_hero_content"]
    assert document["instances"]["starter_event_title"]["props"]["content"] == "Global Tech Summit 2026"
    assert document["instances"]["starter_nav_agenda"]["props"]["attributes"]["href"] == "#agenda"
    assert document["instances"]["starter_agenda"]["props"]["attributes"]["id"] == "agenda"
    assert _validate_document(document) == []

    site = SimpleNamespace(id=uuid.uuid4(), event_id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Master", slug="master")
    revision = SimpleNamespace(id=uuid.uuid4(), checksum="starter")
    manifest = _render_deployment_manifest(document, site, revision)
    html = manifest["pages"][0]["html"]
    assert "Global Tech Summit 2026</h1>" in html
    assert 'data-wb-instance-id="starter_header"' in html
    assert 'id="agenda"' in html
    assert "Ready To Join Us?" in html


def test_legacy_starter_repair_only_matches_unedited_placeholder() -> None:
    legacy = {
        "pages": [{"id": "home", "rootInstanceId": "root"}],
        "instances": {
            "root": {"componentType": "page-root"},
            "hero": {"componentType": "hero"},
            "title": {"componentType": "heading"},
        },
    }

    assert _is_legacy_empty_starter(legacy) is True
    assert _is_legacy_empty_starter(_default_platform_template_document()) is False
    legacy["instances"]["button"] = {"componentType": "button"}
    assert _is_legacy_empty_starter(legacy) is False


def test_temporary_preview_wraps_site_with_device_controls_and_live_sync() -> None:
    site = SimpleNamespace(id=uuid.uuid4(), event_id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Preview Conference", slug="preview")
    revision = SimpleNamespace(id=uuid.uuid4(), checksum="preview-revision")
    manifest = _render_deployment_manifest(_document(), site, revision)
    preview_id = uuid.uuid4()

    response = _serve_preview_page(manifest, "", "/preview/url", "/preview/url/manifest", preview_id)
    body = response.body.decode("utf-8")

    assert "temporary preview link" in body
    assert 'data-preview-device="desktop"' in body
    assert 'data-preview-device="tablet"' in body
    assert 'data-preview-device="mobile"' in body
    assert "srcdoc=" in body
    assert "/preview/url/manifest" in body
    assert response.headers["x-website-preview"] == str(preview_id)


def test_temporary_preview_serves_each_page_and_keeps_internal_links_inside_preview() -> None:
    document = _document()
    document["instances"]["root"]["children"].append("agenda-link")
    document["instances"]["agenda-link"] = {
        "id": "agenda-link",
        "componentType": "button",
        "parentId": "root",
        "children": [],
        "props": {
            "tagName": "a",
            "content": "View agenda",
            "attributes": {"href": "/agenda"},
        },
        "styles": {},
        "bindings": [],
    }
    site = SimpleNamespace(id=uuid.uuid4(), event_id=uuid.uuid4(), organization_id=uuid.uuid4(), name="Preview Conference", slug="preview")
    revision = SimpleNamespace(id=uuid.uuid4(), checksum="preview-routes")
    manifest = _render_deployment_manifest(document, site, revision)
    preview_id = uuid.uuid4()

    home = _serve_preview_page(manifest, "", "/preview/url", "/preview/url/manifest", preview_id).body.decode("utf-8")
    agenda = _serve_preview_page(manifest, "agenda", "/preview/url", "/preview/url/manifest", preview_id).body.decode("utf-8")

    assert "View agenda" in home
    assert "window.top.location.href = previewPrefix +" in home
    assert "/preview/url" in home
    assert "Agenda" in agenda
    assert "agenda-title" in agenda
