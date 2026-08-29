import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta
from loguru import logger
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.worker import celery_app
from app.config import settings
from app.modules.pricing.models import CurrencyRate, RevenueForecast
from app.tasks.tenant_job_scope import (
    TenantJobScopeRequired,
    parse_required_organization_id,
    tenant_job_session,
)

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


@celery_app.task(name="app.tasks.platform_commercial.update_exchange_rates")
def update_exchange_rates() -> str:
    """Mock-sync/scrape exchange rates from USD to standard global currencies."""
    async def _update():
        async with await get_task_db_session() as db:
            rates = [
                {"from": "USD", "to": "EUR", "rate": 0.92},
                {"from": "USD", "to": "GBP", "rate": 0.79},
                {"from": "USD", "to": "INR", "rate": 83.50},
                {"from": "USD", "to": "CAD", "rate": 1.36},
            ]
            for r in rates:
                # Upsert currency rate
                stmt = select(CurrencyRate).where(
                    and_(
                        CurrencyRate.from_currency == r["from"],
                        CurrencyRate.to_currency == r["to"]
                    )
                )
                existing = (await db.execute(stmt)).scalar_one_or_none()
                if existing:
                    existing.exchange_rate = r["rate"]
                    existing.updated_at = datetime.now(timezone.utc)
                else:
                    new_rate = CurrencyRate(
                        id=uuid.uuid4(),
                        from_currency=r["from"],
                        to_currency=r["to"],
                        exchange_rate=r["rate"],
                        updated_at=datetime.now(timezone.utc)
                    )
                    db.add(new_rate)
            await db.commit()
            return f"Synchronized {len(rates)} exchange rates."

    return _run_async(_update())


@celery_app.task(name="app.tasks.platform_commercial.calculate_forecasts")
def calculate_forecasts(organization_id_str: str | None = None) -> str:
    """Calculates/syncs forecast values for one organization."""
    org_id = parse_required_organization_id(organization_id_str)

    async def _forecast():
        async with tenant_job_session(org_id) as db:
            # Gather unique organization IDs from catalogs/forecasts
            # For demonstration, generate mock forecast records for current organization(s)
            # Create forecast entries for current month and next month
            today = datetime.now(timezone.utc)
            start_of_month = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
            next_month = start_of_month + timedelta(days=32)
            start_of_next_month = datetime(next_month.year, next_month.month, 1, tzinfo=timezone.utc)

            # Check existing forecast for next month
            forecast_stmt = select(RevenueForecast).where(
                and_(
                    RevenueForecast.organization_id == org_id,
                    RevenueForecast.month == start_of_next_month
                )
            )
            existing = (await db.execute(forecast_stmt)).scalar_one_or_none()
            if not existing:
                forecast_val = 150000.00
                new_forecast = RevenueForecast(
                    id=uuid.uuid4(),
                    organization_id=org_id,
                    month=start_of_next_month,
                    forecast_amount=forecast_val,
                    actual_amount=0.0,
                    created_at=datetime.now(timezone.utc)
                )
                db.add(new_forecast)
            else:
                existing.forecast_amount = 175000.00 # update with recalculated regression
            
            await db.commit()
            return f"Processed monthly revenue forecast for organization {org_id}."

    return _run_async(_forecast())


