"""One approved tenant/page of historical upload fences; restricted login only.

Use the deployment's secure process environment for DATABASE_URL_SYNC/ASYNC.
Never pass secrets in arguments. No automatic tenant discovery or full-table loop.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))


async def run(args):
    from sqlalchemy import text
    import app.models  # Register relationships used by existing domain models.
    from app.modules.registration.services.upload_fence_reconciliation import (
        reconcile_failed_upload_fences, review_missing_upload_paths,
    )
    from app.modules.registration.services.upload_fence_snapshot import (
        capture_upload_fence_snapshot, read_upload_fence_snapshot_page,
    )
    from app.tasks.tenant_job_scope import tenant_job_session

    capture = getattr(args, "capture_snapshot", None)
    snapshot_dir = getattr(args, "snapshot_dir", None)
    snapshot_page = getattr(args, "snapshot_page", None)
    digest = getattr(args, "reviewed_page_sha256", None)
    review = getattr(args, "review_missing_path", False)
    if review and (not args.upload_id or args.apply or args.after or capture or snapshot_dir
            or snapshot_page is not None or digest or getattr(args, "approval_reference", None)
            or getattr(args, "incompatible_writers_drained", False)):
        raise ValueError("Missing-path review requires exact IDs only and cannot apply changes.")
    if capture and (args.apply or args.after or args.upload_id or snapshot_dir or snapshot_page is not None or digest):
        raise ValueError("Capture cannot be combined with repair or other selections.")
    if snapshot_dir is not None or snapshot_page is not None or digest is not None:
        if snapshot_dir is None or snapshot_page is None or digest is None or args.after or args.upload_id:
            raise ValueError("Snapshot page selection requires its directory, page index and reviewed digest only.")
    if args.apply and not args.upload_id and snapshot_dir is None:
        raise ValueError("Apply requires reviewed exact IDs or a captured snapshot page, not a live keyset scan.")
    async with tenant_job_session(args.organization_id) as db:
        state = (await db.execute(text("""SELECT current_database() AS database,
            r.rolsuper, r.rolbypassrls,
            EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE (n.nspname,c.relname) IN (('content','durable_uploads'),
                    ('platform','usage_reservations'),('command_center_audit','logs'))
                AND pg_has_role(current_user,c.relowner,'USAGE')) AS owns_tables
            FROM pg_roles r WHERE r.rolname=current_user"""))).mappings().one()
        if (state["database"] != args.expected_database or state["rolsuper"]
                or state["rolbypassrls"] or state["owns_tables"]):
            raise RuntimeError("Expected database and restricted non-owner runtime login required.")
        indexes = await db.scalar(text("""SELECT count(*) FROM pg_index i
            JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE i.indisvalid AND i.indisready AND (n.nspname,c.relname) IN (
                ('content','ix_upload_failed_reconciliation'),
                ('content','ix_upload_cleanup_intent_recovery'),
                ('platform','ix_upload_reservation_identity_all_states'))"""))
        if indexes != 3:
            raise RuntimeError("Apply forward migration 3640 and verify its indexes before reconciliation.")
    if capture:
        manifest = await capture_upload_fence_snapshot(organization_id=args.organization_id,
            directory=capture, database=args.expected_database, build_id=args.build_id)
        return {**manifest, "mode": "CAPTURED", "restricted_role_and_reconciliation_indexes_verified": True}
    ids = tuple(args.upload_id) if args.upload_id else None
    if snapshot_dir is not None:
        ids = read_upload_fence_snapshot_page(directory=snapshot_dir, page_index=snapshot_page,
            reviewed_sha256=digest, organization_id=args.organization_id, database=args.expected_database)
    if review:
        result = await review_missing_upload_paths(organization_id=args.organization_id,
            only_upload_ids=ids)
    else:
        result = await reconcile_failed_upload_fences(organization_id=args.organization_id,
            after=args.after, limit=100 if snapshot_dir is not None else args.limit, apply=args.apply,
            approval_reference=args.approval_reference,
            incompatible_writers_drained=args.incompatible_writers_drained,
            only_upload_ids=ids)
    result["database"] = args.expected_database
    result["build_id"] = args.build_id
    result["restricted_role_and_reconciliation_indexes_verified"] = True
    result["cohort_source"] = "CAPTURED_PAGE" if snapshot_dir is not None else "EXPLICIT_IDS" if ids else "LIVE_REPORT"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization-id", type=uuid.UUID, required=True)
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--after", type=uuid.UUID)
    parser.add_argument("--capture-snapshot", type=Path,
        help="Create a new fixed-cohort directory, read-only; no provider operations.")
    parser.add_argument("--snapshot-dir", type=Path)
    parser.add_argument("--snapshot-page", type=int)
    parser.add_argument("--reviewed-page-sha256")
    parser.add_argument("--upload-id", type=uuid.UUID, action="append",
        help="Optional reviewed exact upload IDs (repeat, maximum 100).")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--review-missing-path", action="store_true",
        help="Exact-ID correction proposal only; never changes metadata or contacts storage.")
    parser.add_argument("--approval-reference")
    parser.add_argument("--incompatible-writers-drained", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists() or not args.output.parent.is_dir():
        parser.error("Evidence output must be a new file in an existing directory.")
    try:
        result = asyncio.run(run(args))
    except Exception as exc:
        # Provider exceptions/connection URLs may contain credentials. No repr.
        print(json.dumps({"status": "FAILED", "error_type": type(exc).__name__}))
        return 1
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")
    if result.get("mode") == "CAPTURED":
        print(json.dumps({"status": "CAPTURED", "records": result["record_count"],
            "pages": result["page_count"], "provider_io_performed": False}))
        return 0
    blocked = any(row["status"] not in {"NOT_MANAGED", "ELIGIBLE", "SEALED", "ALREADY_SEALED", "RECORDED_SEALED"}
        for row in result["records"])
    print(json.dumps({"status": "BLOCKED" if blocked else "PASSED", "checked": len(result["records"]),
        "has_more": result["next_cursor"] is not None, "retry_page": result["retry_page"]}))
    return 2 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
