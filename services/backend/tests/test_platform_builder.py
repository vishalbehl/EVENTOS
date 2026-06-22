import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from tests.conftest import auth_headers
from app.modules.templates.services import TemplateService
from app.modules.website_builder.services import WebsiteBuilderService, PageBuilderService
from app.modules.blueprints.services import BlueprintService
from app.modules.theme_engine.services import ThemeService
from app.modules.marketplace.services.marketplace_service import MarketplaceService

from app.modules.templates.models import Template, TemplateCategory, TemplateVersion, TemplateInstallation
from app.modules.website_builder.models import Site, Page, PageSection, PageComponent, SiteDomain, NavigationMenu
from app.modules.blueprints.models import EventBlueprint
from app.modules.theme_engine.models import Theme


@pytest.mark.asyncio
async def test_template_creation_cloning_and_rollback(db: AsyncSession):
    # 1. Create a category
    category = TemplateCategory(
        id=uuid.uuid4(),
        name="Conference Themes",
        description="Layout themes for dev summits"
    )
    db.add(category)
    await db.flush()

    # 2. Create template
    template_data = {
        "name": "DevCon Glassmorphism Theme",
        "category_id": category.id,
        "template_type": "WEBSITE",
        "status": "DRAFT",
        "visibility": "PUBLIC",
        "content": {"styles": {"primary_color": "hsl(260, 85%, 60%)"}}
    }
    template = await TemplateService.create_template(db, template_data)
    assert template.name == "DevCon Glassmorphism Theme"
    assert template.status == "PUBLISHED"
    assert template.current_version_id is not None

    # 3. Publish a new version
    new_version_data = {
        "description": "Version 2 Release",
        "content": {"styles": {"primary_color": "hsl(280, 85%, 60%)", "glass_blur": "12px"}}
    }
    v2 = await TemplateService.publish_template(db, template.id, new_version_data)
    assert v2.version_number == 2
    assert template.current_version_id == v2.id

    # 4. Clone template
    cloned = await TemplateService.clone_template(db, template.id)
    assert cloned.name == "Copy of DevCon Glassmorphism Theme"
    assert cloned.status == "PUBLISHED"

    # 5. Rollback to version 1
    v1_reloaded = await TemplateService.rollback_version(db, template.id, 1)
    assert template.current_version_id == v1_reloaded.id


@pytest.mark.asyncio
async def test_website_builder_page_duplication_and_navigation(db: AsyncSession, organization, event):
    # 1. Create site
    site_payload = {
        "organization_id": organization.id,
        "event_id": event.id,
        "name": "Acme Dev Summit Site",
        "domain": "summit.acme.corp",
        "slug": "acme-devsummit"
    }
    site = await WebsiteBuilderService.create_site(db, site_payload)
    assert site.name == "Acme Dev Summit Site"
    assert site.status == "DRAFT"

    # Fetch default home page created
    stmt = select(Page).where(Page.site_id == site.id)
    pages = (await db.execute(stmt)).scalars().all()
    assert len(pages) == 1
    home_page = pages[0]
    assert home_page.is_homepage is True

    # 2. Add Section
    sec = await PageBuilderService.add_section(db, home_page.id, "COUNTDOWN", {"date": "2026-10-10T00:00:00Z"})
    assert sec.section_type == "COUNTDOWN"

    # 3. Save Draft Layout
    sections_draft = [
        {
            "section_type": "HERO",
            "settings": {"headline": "Welcome!"},
            "components": [
                {"component_type": "BUTTON", "settings": {"label": "Get Ticket"}, "styles": {}}
            ]
        }
      ]
    await PageBuilderService.save_draft(db, home_page.id, sections_draft)
    
    # 4. Duplicate Page
    page_copy = await WebsiteBuilderService.duplicate_page(db, home_page.id)
    assert page_copy.name == "Home Copy"

    # 5. Generate Navigation Menu
    menu = await WebsiteBuilderService.generate_navigation(db, site.id)
    assert menu.name == "Main Navigation"


@pytest.mark.asyncio
async def test_blueprint_system_install(db: AsyncSession, organization, event):
    # 1. Create Blueprint
    blueprint_payload = {
        "name": "Standard Medical Congress Blueprint",
        "industry": "Medical",
        "description": "Standard abstract forms and CME badge setups.",
        "is_system": True,
        "blueprint_data": {
            "templates": ["abstract_theme"],
            "steps": ["deploy_website", "register_tickets"]
        }
    }
    blueprint = await BlueprintService.create_blueprint(db, blueprint_payload)
    assert blueprint.name == "Standard Medical Congress Blueprint"

    # 2. Clone Blueprint
    cloned = await BlueprintService.clone_blueprint(db, blueprint.id)
    assert cloned.name == "Copy of Standard Medical Congress Blueprint"

    # 3. Install Blueprint simulation
    install = await BlueprintService.install_blueprint(db, organization.id, event.id, blueprint.id)
    assert install.blueprint_id == blueprint.id


@pytest.mark.asyncio
async def test_theme_apply_and_marketplace_listing(db: AsyncSession, organization, event):
    # 1. Create Theme
    theme_payload = {
        "organization_id": organization.id,
        "name": "Clean Obsidian Dark Mode",
        "description": "Premium dark HSL preset",
        "theme_data": {"colors": {"background": "#000", "primary": "#8b5cf6"}}
    }
    theme = await ThemeService.create_theme(db, theme_payload)
    assert theme.name == "Clean Obsidian Dark Mode"

    # 2. Apply theme to Site (setup site first)
    site_payload = {
        "organization_id": organization.id,
        "event_id": event.id,
        "name": "Obsidian Summit Site",
        "slug": "obsidian-summit"
    }
    site = await WebsiteBuilderService.create_site(db, site_payload)
    await ThemeService.apply_theme(db, theme.id, site.id)

    # 3. Marketplace Listing setup (need template first)
    template_data = {
        "name": "Obsidian Grid Landing",
        "template_type": "WEBSITE",
        "status": "DRAFT",
        "visibility": "PUBLIC"
    }
    template = await TemplateService.create_template(db, template_data)
    listing = await MarketplaceService.publish_listing(db, template.id, {"price": 29.99, "status": "ACTIVE"})
    assert listing.price == 29.99

    # 4. Review & Favorite
    from app.modules.identity.models.user import User
    user = (await db.execute(select(User).limit(1))).scalar()
    if user:
        fav = await MarketplaceService.favorite_template(db, user.id, template.id)
        assert fav.template_id == template.id
        
        rev = await MarketplaceService.review_template(db, user.id, template.id, 5, "Amazing theme design!")
        assert rev.rating == 5


@pytest.mark.asyncio
async def test_builder_and_templates_api_endpoints(client: AsyncClient, organizer, event):
    headers = auth_headers(organizer)

    # 1. Create Template via HTTP
    template_payload = {
        "name": "DevCon Glassmorphism Theme",
        "template_type": "WEBSITE",
        "status": "DRAFT",
        "visibility": "PUBLIC"
    }
    res = await client.post("/templates", json=template_payload, headers=headers)
    assert res.status_code == 201
    template_id = res.json()["id"]

    # 2. Get Templates list
    res = await client.get("/templates", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # 3. Publish Version
    ver_payload = {
        "description": "V1 Released",
        "content": {"styles": {"primary_color": "hsl(260, 85%, 60%)"}}
    }
    res = await client.post(f"/templates/{template_id}/publish", json=ver_payload, headers=headers)
    assert res.status_code == 200

    # 4. Create Site via HTTP
    site_payload = {
        "event_id": str(event.id),
        "name": "DevCon Summit Site",
        "slug": f"devcon-summit-{uuid.uuid4().hex[:4]}",
        "domain": "devcon.acme.corp",
        "status": "DRAFT"
    }
    res = await client.post("/sites", json=site_payload, headers=headers)
    assert res.status_code == 201
    site_id = res.json()["id"]

    # 5. List Sites
    res = await client.get("/sites", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1

