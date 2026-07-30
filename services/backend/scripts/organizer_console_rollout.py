"""Dry-run-first Organizer Console contract and usage rollout utility."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.modules.platform.services.capability_rollout_preflight_service import (
    CapabilityRolloutPreflightService,
)
from app.tasks.organization_console_rollout_tasks import backfill_organization_console
from app.tasks.tenant_job_scope import tenant_job_session


async def _preflight(organization_id: str) -> dict:
    parsed_id = uuid.UUID(organization_id)
    async with tenant_job_session(parsed_id) as db:
        result = await CapabilityRolloutPreflightService.evaluate(db, parsed_id)
        await db.rollback()
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill one organization's event contracts and usage baselines")
    parser.add_argument("organization_id", help="Organization UUID")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Persist the backfill and enable shadow mode")
    mode.add_argument(
        "--preflight",
        action="store_true",
        help="Run the canonical read-only enforcement preflight",
    )
    args = parser.parse_args()
    report = (
        asyncio.run(_preflight(args.organization_id))
        if args.preflight
        else asyncio.run(
            backfill_organization_console(
                args.organization_id,
                apply=args.apply,
            )
        )
    )
    print(json.dumps(report, indent=2, sort_keys=True, default=str))
    if args.preflight:
        if not report["ready_for_enforcement"]:
            raise SystemExit(2)
        return
    if not args.apply:
        print("DRY RUN ONLY. Re-run with --apply after reviewing this report.")


if __name__ == "__main__":
    main()
