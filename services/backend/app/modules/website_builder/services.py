import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.modules.website_builder.models import (
    Site, Page, PageSection, PageComponent, PageAsset, NavigationMenu, MenuItem, SiteDomain
)

class WebsiteBuilderService:
    @staticmethod
    async def create_site(db: AsyncSession, site_data: Dict[str, Any]) -> Site:
        site = Site(
            id=uuid.uuid4(),
            organization_id=site_data["organization_id"],
            event_id=site_data["event_id"],
            template_id=site_data.get("template_id"),
            name=site_data["name"],
            slug=site_data.get("slug") or site_data["name"].lower().replace(" ", "-"),
            domain=site_data.get("domain"),
            status="DRAFT"
        )
        db.add(site)
        await db.flush()

        # Create default home page
        home_page = Page(
            id=uuid.uuid4(),
            site_id=site.id,
            name="Home",
            slug="home",
            title="Welcome to our Event",
            description="Event home landing page",
            is_homepage=True,
            sort_order=1,
            status="DRAFT"
        )
        db.add(home_page)
        await db.flush()

        # Create default Hero section
        hero_section = PageSection(
            id=uuid.uuid4(),
            page_id=home_page.id,
            section_type="HERO",
            sort_order=1,
            settings={"headline": f"Welcome to {site.name}!", "cta_text": "Register Now"}
        )
        db.add(hero_section)
        await db.flush()

        # Create default Site domain entry
        if site.domain:
            domain_entry = SiteDomain(
                id=uuid.uuid4(),
                site_id=site.id,
                domain=site.domain,
                status="PENDING",
                ssl_status="NONE"
            )
            db.add(domain_entry)
            await db.flush()

        await db.commit()
        return site

    @staticmethod
    async def publish_site(db: AsyncSession, site_id: uuid.UUID) -> Site:
        site = await db.get(Site, site_id)
        if not site:
            raise ValueError("Site not found")

        site.status = "PUBLISHED"
        site.published_at = datetime.now(timezone.utc)

        # Publish all pages
        result = await db.execute(select(Page).filter_by(site_id=site_id))
        pages = result.scalars().all()
        for p in pages:
            p.status = "PUBLISHED"

        await db.commit()
        return site

    @staticmethod
    async def duplicate_page(db: AsyncSession, page_id: uuid.UUID) -> Page:
        original = await db.get(Page, page_id)
        if not original:
            raise ValueError("Page not found")

        clone = Page(
            id=uuid.uuid4(),
            site_id=original.site_id,
            name=f"{original.name} Copy",
            slug=f"{original.slug}-copy-{uuid.uuid4().hex[:4]}",
            title=original.title,
            description=original.description,
            seo_title=original.seo_title,
            seo_description=original.seo_description,
            is_homepage=False,
            sort_order=original.sort_order + 1,
            status="DRAFT"
        )
        db.add(clone)
        await db.flush()

        # Duplicate sections
        result_sec = await db.execute(select(PageSection).filter_by(page_id=page_id))
        sections = result_sec.scalars().all()
        for sec in sections:
            clone_sec = PageSection(
                id=uuid.uuid4(),
                page_id=clone.id,
                section_type=sec.section_type,
                sort_order=sec.sort_order,
                settings=sec.settings
            )
            db.add(clone_sec)
            await db.flush()

            # Duplicate components in section
            result_comp = await db.execute(select(PageComponent).filter_by(section_id=sec.id))
            components = result_comp.scalars().all()
            for comp in components:
                clone_comp = PageComponent(
                    id=uuid.uuid4(),
                    section_id=clone_sec.id,
                    component_type=comp.component_type,
                    settings=comp.settings,
                    styles=comp.styles
                )
                db.add(clone_comp)
                await db.flush()

        await db.commit()
        return clone

    @staticmethod
    async def generate_navigation(db: AsyncSession, site_id: uuid.UUID) -> NavigationMenu:
        site = await db.get(Site, site_id)
        if not site:
            raise ValueError("Site not found")

        # Create or update main menu
        result_menu = await db.execute(select(NavigationMenu).filter_by(site_id=site_id))
        menu = result_menu.scalars().first()
        if not menu:
            menu = NavigationMenu(
                id=uuid.uuid4(),
                site_id=site_id,
                name="Main Navigation"
            )
            db.add(menu)
            await db.flush()

        # Clear existing menu items
        result_items = await db.execute(select(MenuItem).filter_by(menu_id=menu.id))
        existing_items = result_items.scalars().all()
        for item in existing_items:
            await db.delete(item)
        await db.flush()

        # Generate menu items from published pages
        result_pages = await db.execute(select(Page).filter_by(site_id=site_id).order_by(Page.sort_order.asc()))
        pages = result_pages.scalars().all()
        for idx, page in enumerate(pages):
            item = MenuItem(
                id=uuid.uuid4(),
                menu_id=menu.id,
                label=page.name,
                url=f"/{page.slug}",
                sort_order=idx + 1
            )
            db.add(item)

        await db.commit()
        return menu


class PageBuilderService:
    @staticmethod
    async def add_section(db: AsyncSession, page_id: uuid.UUID, section_type: str, settings: Dict[str, Any]) -> PageSection:
        # Find next order
        latest = (await db.execute(
            select(PageSection)
            .filter_by(page_id=page_id)
            .order_by(PageSection.sort_order.desc())
        )).scalars().first()
        next_order = (latest.sort_order + 1) if latest else 1

        section = PageSection(
            id=uuid.uuid4(),
            page_id=page_id,
            section_type=section_type,
            sort_order=next_order,
            settings=settings
        )
        db.add(section)
        await db.commit()
        return section

    @staticmethod
    async def move_section(db: AsyncSession, section_id: uuid.UUID, new_order: int) -> PageSection:
        section = await db.get(PageSection, section_id)
        if not section:
            raise ValueError("Section not found")
        section.sort_order = new_order
        await db.commit()
        return section

    @staticmethod
    async def add_component(db: AsyncSession, section_id: uuid.UUID, component_type: str, settings: Dict[str, Any], styles: Dict[str, Any]) -> PageComponent:
        component = PageComponent(
            id=uuid.uuid4(),
            section_id=section_id,
            component_type=component_type,
            settings=settings,
            styles=styles
        )
        db.add(component)
        await db.commit()
        return component

    @staticmethod
    async def save_draft(db: AsyncSession, page_id: uuid.UUID, sections_data: List[Dict[str, Any]]) -> Page:
        page = await db.get(Page, page_id)
        if not page:
            raise ValueError("Page not found")

        # Clear existing sections and components
        result_sec = await db.execute(select(PageSection).filter_by(page_id=page_id))
        old_sections = result_sec.scalars().all()
        for os in old_sections:
            result_comp = await db.execute(select(PageComponent).filter_by(section_id=os.id))
            components = result_comp.scalars().all()
            for comp in components:
                await db.delete(comp)
            await db.delete(os)
        await db.flush()

        # Re-insert sections and components
        for idx, sec_val in enumerate(sections_data):
            sec = PageSection(
                id=uuid.uuid4(),
                page_id=page_id,
                section_type=sec_val["section_type"],
                sort_order=idx + 1,
                settings=sec_val.get("settings", {})
            )
            db.add(sec)
            await db.flush()

            for comp_val in sec_val.get("components", []):
                comp = PageComponent(
                    id=uuid.uuid4(),
                    section_id=sec.id,
                    component_type=comp_val["component_type"],
                    settings=comp_val.get("settings", {}),
                    styles=comp_val.get("styles", {})
                )
                db.add(comp)
                await db.flush()

        page.status = "DRAFT"
        await db.commit()
        return page

    @staticmethod
    async def publish_page(db: AsyncSession, page_id: uuid.UUID) -> Page:
        page = await db.get(Page, page_id)
        if not page:
            raise ValueError("Page not found")
        page.status = "PUBLISHED"
        await db.commit()
        return page

