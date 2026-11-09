"""Transaction-scoped coordination between catalogue retirement and reference writers."""
from sqlalchemy import text

_LOCK_NAMESPACE = 1128353876
_TEMPLATE_LIFECYCLE = 20
_CATEGORY_LIFECYCLE = 21


async def lock_catalogue_reference_writes(db) -> None:
    """Allow concurrent writers while excluding either retirement operation."""
    # Deterministic template-then-category ordering is shared by every writer.
    await db.execute(text("SELECT pg_advisory_xact_lock_shared(:ns, :key)"),
        {"ns": _LOCK_NAMESPACE, "key": _TEMPLATE_LIFECYCLE})
    await db.execute(text("SELECT pg_advisory_xact_lock_shared(:ns, :key)"),
        {"ns": _LOCK_NAMESPACE, "key": _CATEGORY_LIFECYCLE})


async def lock_template_retirement(db) -> None:
    await db.execute(text("SELECT pg_advisory_xact_lock(:ns, :key)"),
        {"ns": _LOCK_NAMESPACE, "key": _TEMPLATE_LIFECYCLE})


async def lock_category_retirement(db) -> None:
    # Match writer ordering even though category retirement does not mutate a
    # template lifecycle row directly.
    await db.execute(text("SELECT pg_advisory_xact_lock_shared(:ns, :key)"),
        {"ns": _LOCK_NAMESPACE, "key": _TEMPLATE_LIFECYCLE})
    await db.execute(text("SELECT pg_advisory_xact_lock(:ns, :key)"),
        {"ns": _LOCK_NAMESPACE, "key": _CATEGORY_LIFECYCLE})
