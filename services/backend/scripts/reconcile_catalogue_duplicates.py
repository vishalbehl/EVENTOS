"""Explicitly reconcile active catalogue duplicates before migration 3510.

Dry-run is the default. The mapping file must name every duplicate row and its
approved replacement; this tool never infers a winner from age, name, or a
legacy global role. Run after revision 3500 and before revision 3510.
"""
from __future__ import annotations

import argparse
import json
import os
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text


def _authorise_actor(connection, actor_id):
    # Discovery is not authority. Use the same canonical revision row as the
    # identity/lifecycle commands, then recheck the identity under that fence.
    # Acquire it before catalogue locks and retain it through commit/rollback.
    owner = connection.scalar(text("SELECT organization_id FROM identity.users WHERE id=:actor"),
        {"actor": actor_id})
    if owner is None:
        raise RuntimeError("Approved active platform administrator does not exist.")
    revision = connection.scalar(text("SELECT revision FROM organizer_access.organization_access_revisions "
        "WHERE organization_id=:owner FOR SHARE"), {"owner": owner})
    if revision is None:
        raise RuntimeError("Platform access revision requires reconciliation before maintenance.")
    actor_exists = connection.scalar(text("""
        SELECT EXISTS(
            SELECT 1 FROM identity.users actor
            JOIN platform.organizations organization ON organization.id=actor.organization_id
            WHERE actor.id=:actor AND actor.organization_id=:owner
              AND actor.is_active=true AND actor.deleted_at IS NULL
              AND actor.platform_role='SUPER_ADMIN' AND organization.is_platform_org=true
              AND organization.is_active=true AND organization.suspended_at IS NULL
              AND organization.archived_at IS NULL)
    """), {"actor": actor_id, "owner": owner})
    if not actor_exists:
        raise RuntimeError("Approved active platform administrator does not exist.")


def _uuid_map(value: object, label: str) -> dict[uuid.UUID, uuid.UUID]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object mapping duplicate IDs to replacement IDs.")
    result: dict[uuid.UUID, uuid.UUID] = {}
    for source, replacement in value.items():
        source_id, replacement_id = uuid.UUID(str(source)), uuid.UUID(str(replacement))
        if source_id == replacement_id:
            raise ValueError(f"{label} maps a record to itself: {source_id}")
        result[source_id] = replacement_id
    return result


def _same_owner_and_slug(source, replacement, label: str) -> None:
    if source is None or replacement is None:
        raise RuntimeError(f"{label} source or replacement does not exist.")
    if not replacement["is_active"] or replacement["deleted_at"] is not None:
        raise RuntimeError(f"{label} replacement is not active.")
    if source["organization_id"] != replacement["organization_id"] or source["slug"] != replacement["slug"]:
        raise RuntimeError(f"{label} replacement must have the same owner and slug as the duplicate.")


def _lineage(rows) -> list[dict[str, object]]:
    """Return a compact, deterministic resource-version lineage projection."""
    return [
        {
            "resource_id": str(row["id"]),
            "previous_version": int(row["previous_version"]),
            "resource_version": int(row["resource_version"]),
        }
        for row in sorted(rows, key=lambda item: str(item["id"]))
    ]


def _template_identity(row) -> tuple[str, str, uuid.UUID | None]:
    """A duplicate slug does not establish compatible operational authority."""
    purpose, scope = row["category_key"], row["scope_type"]
    if not isinstance(purpose, str) or not purpose.strip():
        raise RuntimeError("Template purpose requires reviewed correction before reassignment.")
    owner = row["organization_id"]
    if scope not in {"GLOBAL", "ORGANIZATION", "EVENT"} or ((scope == "GLOBAL") != (owner is None)):
        raise RuntimeError("Template owner and scope require reviewed correction before reassignment.")
    event_id = None
    if scope == "EVENT":
        settings = row["settings"]
        if not isinstance(settings, dict):
            raise RuntimeError("Event template scope requires valid event markers.")
        try:
            markers = [uuid.UUID(str(settings[key])) for key in ("_event_id", "event_id") if key in settings]
        except (ValueError, TypeError, AttributeError) as exc:
            raise RuntimeError("Event template scope requires valid event markers.") from exc
        if not markers or any(marker != markers[0] for marker in markers):
            raise RuntimeError("Event template scope requires one unambiguous event.")
        event_id = markers[0]
    return purpose, scope, event_id


def _check_reference_budget(connection, source_id, reference_budget: int, *, kind: str) -> None:
    """Probe at most budget+1 indexed references before writing any of them."""
    if not 0 <= reference_budget <= 100000:
        raise RuntimeError("Remaining reference budget must be between 0 and 100000.")
    if kind == "category":
        statement = """
            SELECT count(*) FROM (
                SELECT id FROM design.form_templates WHERE category_id=:source
                UNION ALL
                SELECT id FROM registration.registration_forms WHERE category_id=:source
                LIMIT :probe_limit
            ) bounded_references
        """
    elif kind == "template":
        statement = """
            SELECT count(*) FROM (
                SELECT id FROM registration.registration_forms WHERE template_id=:source
                UNION ALL
                SELECT id FROM abstract.abstract_forms WHERE schema->>'template_id'=:source_text
                LIMIT :probe_limit
            ) bounded_references
        """
    else:
        raise ValueError("Unknown catalogue reference family.")
    count = connection.scalar(text(statement), {"source": source_id,
        "source_text": str(source_id), "probe_limit": reference_budget + 1})
    if count > reference_budget:
        raise RuntimeError(f"Approved {kind} mapping exceeds the remaining reference-update bound.")


def _reconcile_category(connection, source_id, replacement_id, actor_id, reason,
                        reference_budget: int):
    rows = connection.execute(text("""
        SELECT id, organization_id, slug, is_active, deleted_at, version
        FROM design.form_categories WHERE id IN (:source, :replacement)
        ORDER BY id FOR UPDATE
    """), {"source": source_id, "replacement": replacement_id}).mappings().all()
    by_id = {row["id"]: row for row in rows}
    source, replacement = by_id.get(source_id), by_id.get(replacement_id)
    _same_owner_and_slug(source, replacement, "Category")
    if not source["is_active"] or source["deleted_at"] is not None:
        raise RuntimeError(f"Category duplicate is not active: {source_id}")
    if source["organization_id"] is not None:
        # Maintenance bypasses ordinary tenant filters. A bad historical parent
        # reference must be reviewed, not silently carried into the replacement.
        invalid_owner = connection.scalar(text("""
            SELECT EXISTS(
                SELECT 1 FROM design.form_templates
                WHERE category_id=:source AND organization_id IS DISTINCT FROM :owner
            ) OR EXISTS(
                SELECT 1 FROM registration.registration_forms form
                LEFT JOIN events.events event ON event.id=form.event_id
                WHERE form.category_id=:source
                  AND (event.id IS NULL OR event.organization_id IS DISTINCT FROM :owner)
            )
        """), {"source": source_id, "owner": source["organization_id"]})
        if invalid_owner:
            raise RuntimeError("Category has foreign or unowned references requiring reviewed correction.")
    _check_reference_budget(connection, source_id, reference_budget, kind="category")
    template_rows = connection.execute(text("""
        UPDATE design.form_templates SET category_id=:replacement,
            version=version+1, updated_at=now()
        WHERE category_id=:source
        RETURNING id, version - 1 AS previous_version, version AS resource_version
    """), {"source": source_id, "replacement": replacement_id}).mappings().all()
    registration_rows = connection.execute(text("""
        UPDATE registration.registration_forms SET category_id=:replacement,
            version=version+1, updated_at=now()
        WHERE category_id=:source
        RETURNING id, version - 1 AS previous_version, version AS resource_version
    """), {"source": source_id, "replacement": replacement_id}).mappings().all()
    reference_updates = len(template_rows) + len(registration_rows)
    if reference_updates > reference_budget:
        raise RuntimeError(
            "Approved category mapping exceeds the remaining reference-update bound."
        )
    template_lineage = _lineage(template_rows)
    registration_lineage = _lineage(registration_rows)
    new_version = int(source["version"] or 1) + 1
    connection.execute(text("""
        UPDATE design.form_categories SET is_active=false, version=:version,
            updated_at=now() WHERE id=:source
    """), {"source": source_id, "version": new_version})
    connection.execute(text("""
        INSERT INTO design.form_category_reconciliations
          (id, category_id, replacement_category_id, category_version, operation,
           status, reason, details, actor_user_id, created_at)
        VALUES (:id, :source, :replacement, :version, 'PRECONSTRAINT_REASSIGN',
          'COMPLETED', :reason, CAST(:details AS jsonb), :actor, now())
    """), {"id": uuid.uuid4(), "source": source_id, "replacement": replacement_id,
        "version": new_version, "reason": reason, "actor": actor_id,
        "details": json.dumps({
            "source_category_id": str(source_id),
            "replacement_category_id": str(replacement_id),
            "template_lineage": template_lineage,
            "registration_form_lineage": registration_lineage,
            "reference_updates": reference_updates,
            "lineage_complete": (
                len(template_lineage) + len(registration_lineage) == reference_updates
            ),
        })})
    if len(template_lineage) + len(registration_lineage) != reference_updates:
        raise RuntimeError("CATEGORY_DUPLICATE_REASSIGNMENT_LINEAGE_INCOMPLETE")
    return {"source": str(source_id), "replacement": str(replacement_id),
        "templates": len(template_rows), "registration_forms": len(registration_rows),
        "reference_updates": reference_updates}


def _reconcile_template(connection, source_id, replacement_id, actor_id, reason,
                        reference_budget: int):
    rows = connection.execute(text("""
        SELECT id, organization_id, slug, is_active, is_default, deleted_at, version,
               category_key, scope_type, settings, category_id
        FROM design.form_templates WHERE id IN (:source, :replacement)
        ORDER BY id FOR UPDATE
    """), {"source": source_id, "replacement": replacement_id}).mappings().all()
    by_id = {row["id"]: row for row in rows}
    source, replacement = by_id.get(source_id), by_id.get(replacement_id)
    _same_owner_and_slug(source, replacement, "Template")
    if not source["is_active"] or source["deleted_at"] is not None:
        raise RuntimeError(f"Template duplicate is not active: {source_id}")
    source_identity = _template_identity(source)
    if source_identity != _template_identity(replacement):
        raise RuntimeError("Template replacement must preserve operational purpose, scope and event.")
    if source_identity[2] is not None:
        event_exists = connection.scalar(text("""
            SELECT EXISTS(SELECT 1 FROM events.events
                WHERE id=:event AND organization_id=:owner AND deleted_at IS NULL)
        """), {"event": source_identity[2], "owner": source["organization_id"]})
        if not event_exists:
            raise RuntimeError("Template event does not belong to its recorded owner.")
    # Parent activity/ownership is checked under the same exclusion fence and
    # transaction, before moving references or transferring the default flag.
    category_ids = {row["category_id"] for row in (source, replacement) if row["category_id"] is not None}
    if category_ids:
        parents = connection.execute(text("""
            SELECT id, organization_id, is_active, deleted_at FROM design.form_categories
            WHERE id IN (:first, :last) ORDER BY id FOR UPDATE
        """), {"first": min(category_ids), "last": max(category_ids)}).mappings().all()
        by_category = {row["id"]: row for row in parents}
        for category_id in category_ids:
            parent = by_category.get(category_id)
            if (parent is None or not parent["is_active"] or parent["deleted_at"] is not None
                    or parent["organization_id"] not in (None, source["organization_id"])):
                raise RuntimeError("Template category must be active and owned by its organisation or global.")
    _check_reference_budget(connection, source_id, reference_budget, kind="template")
    registration_rows = connection.execute(text("""
        UPDATE registration.registration_forms SET template_id=:replacement,
            version=version+1, updated_at=now() WHERE template_id=:source
        RETURNING id, version - 1 AS previous_version, version AS resource_version
    """), {"source": source_id, "replacement": replacement_id}).mappings().all()
    abstract_rows = connection.execute(text("""
        UPDATE abstract.abstract_forms
        SET schema=jsonb_set(schema, '{template_id}', to_jsonb(CAST(:replacement AS text)), true),
            version=version+1, updated_at=now()
        WHERE schema->>'template_id'=CAST(:source AS text)
        RETURNING id, version - 1 AS previous_version, version AS resource_version
    """), {"source": str(source_id), "replacement": str(replacement_id)}).mappings().all()
    reference_updates = len(registration_rows) + len(abstract_rows)
    if reference_updates > reference_budget:
        raise RuntimeError(
            "Approved template mapping exceeds the remaining reference-update bound."
        )
    registration_lineage = _lineage(registration_rows)
    abstract_lineage = _lineage(abstract_rows)
    new_version = int(source["version"] or 1) + 1
    if source["is_default"] and not replacement["is_default"]:
        connection.execute(text("""
            UPDATE design.form_templates SET is_default=true, version=version+1,
                updated_at=now() WHERE id=:replacement
        """), {"replacement": replacement_id})
    connection.execute(text("""
        UPDATE design.form_templates SET is_active=false, is_default=false,
            version=:version, updated_at=now() WHERE id=:source
    """), {"source": source_id, "version": new_version})
    connection.execute(text("""
        INSERT INTO design.form_template_reconciliations
          (id, template_id, replacement_template_id, template_version, operation,
           status, reason, details, actor_user_id, created_at)
        VALUES (:id, :source, :replacement, :version, 'PRECONSTRAINT_REASSIGN',
          'COMPLETED', :reason, CAST(:details AS jsonb), :actor, now())
    """), {"id": uuid.uuid4(), "source": source_id, "replacement": replacement_id,
        "version": new_version, "reason": reason, "actor": actor_id,
        "details": json.dumps({
            "source_template_id": str(source_id),
            "replacement_template_id": str(replacement_id),
            "registration_form_lineage": registration_lineage,
            "abstract_form_lineage": abstract_lineage,
            "reference_updates": reference_updates,
            "lineage_complete": (
                len(registration_lineage) + len(abstract_lineage) == reference_updates
            ),
            "default_transferred": bool(source["is_default"] and not replacement["is_default"]),
        })})
    if len(registration_lineage) + len(abstract_lineage) != reference_updates:
        raise RuntimeError("TEMPLATE_DUPLICATE_REASSIGNMENT_LINEAGE_INCOMPLETE")
    return {"source": str(source_id), "replacement": str(replacement_id),
        "registration_forms": len(registration_rows), "abstract_forms": len(abstract_rows),
        "reference_updates": reference_updates,
        "default_transferred": bool(source["is_default"] and not replacement["is_default"])}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--actor-user-id", type=uuid.UUID, required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--max-reference-updates", type=int, default=10000,
        help="Maximum total live references that the approved mapping may rewrite (1-100000).")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not 8 <= len(args.reason.strip()) <= 500:
        parser.error("Reason must be 8-500 characters.")
    if not 1 <= args.max_reference_updates <= 100000:
        parser.error("--max-reference-updates must be between 1 and 100000.")
    database_url = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "")
    if not database_url:
        parser.error("Dedicated MIGRATION_DATABASE_URL_SYNC is required.")
    if args.mapping.stat().st_size > 1024 * 1024:
        parser.error("Mapping document exceeds 1 MiB.")
    payload = json.loads(args.mapping.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or set(payload) != {"categories", "templates"}:
        parser.error("Mapping document requires only categories and templates objects.")
    categories = _uuid_map(payload.get("categories", {}), "categories")
    templates = _uuid_map(payload.get("templates", {}), "templates")
    if len(categories) + len(templates) > 10000:
        parser.error("Mapping document exceeds the 10,000-record operator bound.")
    if set(categories) & set(categories.values()):
        parser.error("Category replacements must be canonical targets, not mapped duplicates.")
    if set(templates) & set(templates.values()):
        parser.error("Template replacements must be canonical targets, not mapped duplicates.")
    engine = create_engine(database_url, pool_size=1, max_overflow=0, pool_pre_ping=True)
    connection = engine.connect()
    transaction = connection.begin()
    try:
        connection.execute(text("SET LOCAL lock_timeout='5s'"))
        connection.execute(text("SET LOCAL statement_timeout='120s'"))
        revision = connection.scalar(text("SELECT version_num FROM public.alembic_version"))
        if revision != "20261009_3500":
            raise RuntimeError("Run only at revision 20261009_3500, before uniqueness enforcement.")
        _authorise_actor(connection, args.actor_user_id)
        # Use the same deterministic template-then-category exclusion ordering
        # as online retirement. This prevents a compatibility writer from
        # recreating a duplicate reference while the explicit mapping runs.
        connection.execute(text("SELECT pg_advisory_xact_lock(1128353876, 20)"))
        connection.execute(text("SELECT pg_advisory_xact_lock(1128353876, 21)"))
        result = {"categories": [], "templates": [],
            "mode": "APPLY" if args.apply else "DRY_RUN"}
        reference_updates = 0
        for source, replacement in sorted(categories.items(), key=lambda item: str(item[0])):
            reconciliation = _reconcile_category(
                connection, source, replacement, args.actor_user_id, args.reason.strip(),
                args.max_reference_updates - reference_updates,
            )
            reference_updates += int(reconciliation["reference_updates"])
            result["categories"].append(reconciliation)
        for source, replacement in sorted(templates.items(), key=lambda item: str(item[0])):
            reconciliation = _reconcile_template(
                connection, source, replacement, args.actor_user_id, args.reason.strip(),
                args.max_reference_updates - reference_updates,
            )
            reference_updates += int(reconciliation["reference_updates"])
            result["templates"].append(reconciliation)
        result["reference_updates"] = reference_updates
        result["max_reference_updates"] = args.max_reference_updates
        remaining = connection.execute(text("""
            SELECT 'category' AS kind, organization_id, slug, count(*) AS duplicate_count
            FROM design.form_categories WHERE deleted_at IS NULL AND is_active=true
            GROUP BY organization_id, slug HAVING count(*) > 1
            UNION ALL
            SELECT 'template', organization_id, slug, count(*)
            FROM design.form_templates WHERE deleted_at IS NULL AND is_active=true
            GROUP BY organization_id, slug HAVING count(*) > 1
        """)).mappings().all()
        result["remaining_conflicts"] = [dict(row) for row in remaining]
        if remaining:
            raise RuntimeError(f"Mapping is incomplete; {len(remaining)} conflict group(s) remain.")
        if args.apply:
            transaction.commit()
        else:
            transaction.rollback()
        print(json.dumps(result, default=str, indent=2))
        return 0
    except Exception:
        transaction.rollback()
        raise
    finally:
        connection.close()
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
