"""Fail closed when a deployed commercial catalogue is incomplete.

Run this with the dedicated migration login immediately after Alembic.  It
does not create or repair customer data; catalogue publication remains owned
by immutable migrations.
"""

from __future__ import annotations

import os
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text


EXPECTED_FAMILY_COUNTS = {
    "WORKSPACE": 5,
    "EVENT": 4,
    "EMC": 4,
    "VENUE": 12,
    "VENUE_ADDON": 20,
    "CAPACITY_ADDON": 44,
}

EXPECTED_EVENT_FEATURE_COUNTS = {
    "EVENT_BASIC": 17,
    "EVENT_PROFESSIONAL": 20,
    "EVENT_PRO": 20,
}


def _required_url() -> str:
    value = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "").strip()
    if not value:
        raise RuntimeError("MIGRATION_DATABASE_URL_SYNC is required")
    return value


def _expected_head() -> str:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    if len(heads) != 1:
        raise RuntimeError(f"Expected one packaged migration head, found {heads}")
    return heads[0]


def main() -> None:
    expected_head = _expected_head()
    engine = create_engine(_required_url(), pool_pre_ping=True)
    failures: list[str] = []
    try:
        with engine.connect() as connection:
            current_heads = set(
                connection.execute(
                    text("SELECT version_num FROM public.alembic_version")
                ).scalars()
            )
            if current_heads != {expected_head}:
                failures.append(
                    f"database migration heads {sorted(current_heads)} do not match {expected_head}"
                )

            family_counts = dict(
                connection.execute(
                    text(
                        "SELECT product_family, count(*) "
                        "FROM commerce.plans GROUP BY product_family"
                    )
                ).all()
            )
            for family, expected in EXPECTED_FAMILY_COUNTS.items():
                actual = int(family_counts.get(family, 0))
                if actual < expected:
                    failures.append(
                        f"{family} catalogue contains {actual} plans; expected at least {expected}"
                    )

            missing_current_versions = connection.execute(
                text(
                    """
                    SELECT plan.code
                    FROM commerce.plans plan
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM commerce.plan_versions version
                        WHERE version.offer_id = plan.id
                          AND version.version_status = 'PUBLISHED'
                          AND version.effective_from <= now()
                          AND (version.effective_until IS NULL OR version.effective_until > now())
                    )
                    ORDER BY plan.code
                    """
                )
            ).scalars().all()
            if missing_current_versions:
                failures.append(
                    "plans without a current published version: "
                    + ", ".join(missing_current_versions)
                )

            event_feature_counts = dict(
                connection.execute(
                    text(
                        """
                        SELECT plan.code, count(*)
                        FROM commerce.plans plan
                        JOIN commerce.plan_versions version ON version.offer_id = plan.id
                        JOIN commerce.plan_entitlements entitlement
                          ON entitlement.offer_version_id = version.id
                        WHERE plan.code = ANY(:codes)
                          AND version.version_status = 'PUBLISHED'
                          AND version.effective_from <= now()
                          AND (version.effective_until IS NULL OR version.effective_until > now())
                          AND entitlement.consumption_model = 'FEATURE'
                          AND entitlement.entitlement_key LIKE 'FEAT\\_%' ESCAPE '\\'
                        GROUP BY plan.code
                        """
                    ),
                    {"codes": list(EXPECTED_EVENT_FEATURE_COUNTS)},
                ).all()
            )
            for code, expected in EXPECTED_EVENT_FEATURE_COUNTS.items():
                actual = int(event_feature_counts.get(code, 0))
                if actual < expected:
                    failures.append(
                        f"{code} contains {actual} typed features; expected at least {expected}"
                    )

            unrestricted_platform = connection.scalar(
                text(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM platform.organizations
                        WHERE is_platform_org = true
                          AND is_internal_unrestricted = true
                          AND archived_at IS NULL
                    )
                    """
                )
            )
            if not unrestricted_platform:
                failures.append(
                    "the canonical platform organization is not present and unrestricted"
                )
    finally:
        engine.dispose()

    if failures:
        raise SystemExit(
            "commercial bootstrap verification failed:\n"
            + "\n".join(f"- {failure}" for failure in failures)
        )
    print(
        "Commercial bootstrap verified: migration head, plan families, "
        "published versions, Event-plan features, and platform organization are present."
    )


if __name__ == "__main__":
    main()
