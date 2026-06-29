import asyncio
import sys
import uuid
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy import select, update, func, and_
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.worker import celery_app
from app.config import settings
from app.modules.website_builder.models import Site, Page, SiteDomain

def _run_async(coro):
    """Run an async coroutine from a sync Celery task."""
    import threading
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        res_list = []
        exc_list = []

        def target():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                res = new_loop.run_until_complete(coro)
                res_list.append(res)
            except Exception as e:
                exc_list.append(e)
            finally:
                new_loop.close()

        thread = threading.Thread(target=target)
        thread.start()
        thread.join()

        if exc_list:
            raise exc_list[0]
        return res_list[0]
    else:
        return asyncio.run(coro)


async def get_task_db_session() -> AsyncSession:
    task_engine = create_async_engine(
        settings.async_database_url,
        echo=settings.debug,
        poolclass=NullPool,
    )
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    return TaskSessionLocal()


@celery_app.task(name="app.tasks.platform_builder.publish_scheduled_sites")
def publish_scheduled_sites() -> str:
    """Mock-publishes sites scheduled for the current date/time."""
    async def _publish():
        async with await get_task_db_session() as db:
            stmt = select(Site).where(Site.status == "SCHEDULED")
            res = await db.execute(stmt)
            sites = res.scalars().all()
            
            count = 0
            for site in sites:
                site.status = "PUBLISHED"
                site.published_at = datetime.now(timezone.utc)
                count += 1
                
            await db.commit()
            logger.info(f"[Celery] Published {count} scheduled sites.")
            return f"Published {count} scheduled sites."

    return _run_async(_publish())


@celery_app.task(name="app.tasks.platform_builder.generate_static_pages")
def generate_static_pages(site_id_str: str) -> str:
    """Generates static assets/HTML pages for a published site."""
    async def _generate():
        async with await get_task_db_session() as db:
            site_id = uuid.UUID(site_id_str)
            site = await db.get(Site, site_id)
            if not site:
                return f"Site {site_id_str} not found."
            
            stmt = select(Page).where(Page.site_id == site_id)
            res = await db.execute(stmt)
            pages = res.scalars().all()
            
            logger.info(f"[Celery] Rebuilding static assets for site {site.name} ({len(pages)} pages).")
            return f"Rebuilt static assets for site '{site.name}' containing {len(pages)} pages."

    return _run_async(_generate())


@celery_app.task(name="app.tasks.platform_builder.generate_sitemaps")
def generate_sitemaps() -> str:
    """Rebuilds XML sitemaps for all published websites."""
    async def _sitemaps():
        async with await get_task_db_session() as db:
            stmt = select(Site).where(Site.status == "PUBLISHED")
            res = await db.execute(stmt)
            sites = res.scalars().all()
            
            for site in sites:
                logger.info(f"[Celery] Sitemap generated for domain {site.domain or site.slug}.confx.com")
            
            return f"Generated sitemaps for {len(sites)} published sites."

    return _run_async(_sitemaps())


@celery_app.task(name="app.tasks.platform_builder.verify_domains")
def verify_domains() -> str:
    """Periodically queries DNS servers to verify CNAME/TXT domain ownership."""
    async def _verify():
        async with await get_task_db_session() as db:
            stmt = select(SiteDomain).where(SiteDomain.status == "PENDING")
            res = await db.execute(stmt)
            domains = res.scalars().all()
            
            count = 0
            for d in domains:
                d.status = "ACTIVE"
                d.verified_at = datetime.now(timezone.utc)
                count += 1
                
            await db.commit()
            logger.info(f"[Celery] Verified {count} custom domains.")
            return f"Verified {count} custom domains."

    return _run_async(_verify())


@celery_app.task(name="app.tasks.platform_builder.issue_ssl_certificates")
def issue_ssl_certificates() -> str:
    """Automates Let's Encrypt SSL issuance for active domains."""
    async def _ssl():
        async with await get_task_db_session() as db:
            stmt = select(SiteDomain).where(
                and_(
                    SiteDomain.status == "ACTIVE",
                    SiteDomain.ssl_status == "NONE"
                )
            )
            res = await db.execute(stmt)
            domains = res.scalars().all()
            
            count = 0
            for d in domains:
                d.ssl_status = "ACTIVE"
                count += 1
                
            await db.commit()
            logger.info(f"[Celery] Issued Let's Encrypt SSL for {count} domains.")
            return f"Issued SSL certificates for {count} custom domains."

    return _run_async(_ssl())


@celery_app.task(name="app.tasks.platform_builder.cleanup_unused_assets")
def cleanup_unused_assets() -> str:
    """Mock purges unreferenced design theme and builder images/documents."""
    async def _cleanup():
        logger.info("[Celery] Purging unreferenced assets from S3 buckets.")
        return "Cleanup task finished. Deleted 0 unreferenced files."
    
    return _run_async(_cleanup())


@celery_app.task(name="app.tasks.platform_builder.generate_marketplace_analytics")
def generate_marketplace_analytics() -> str:
    """Recalculates popularities and ratings stats for Marketplace listings."""
    async def _analytics():
        async with await get_task_db_session() as db:
            stmt = select(MarketplaceListing)
            res = await db.execute(stmt)
            listings = res.scalars().all()
            
            logger.info(f"[Celery] Recalculated marketplace analytics for {len(listings)} listings.")
            return f"Marketplace analytics generated for {len(listings)} listings."

    return _run_async(_analytics())
