"""Create repeatable staging load data with bulk PostgreSQL statements.

This command is explicit and never runs during application startup. It uses
stable business keys so rerunning a profile does not duplicate fixture data.
"""
import argparse
import asyncio
import json
from datetime import date, datetime, timezone

from sqlalchemy import select, text

from app.database import AsyncSessionLocal
import app.models  # Register all ORM models before compiling relationships.
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.identity.services.auth_service import hash_password


async def ensure_registration_entitlement(db, event: Event) -> None:
    """Give the primary load event the same real entitlement path as staging."""
    from app.modules.billing.models.subscription import (
        OrganizationSubscription,
        PlanFeature,
        SubscriptionPlan,
    )
    from app.modules.billing.services.activation_service import ActivationService
    from app.modules.billing.services.capability_service import CapabilityService
    from app.modules.platform.models.feature import FeatureCatalog

    live_activation = await db.scalar(
        select(text("1")).select_from(text("commerce.event_activations")).where(
            text("event_id = :event_id AND organization_id = :organization_id AND activation_status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','TRANSFER_PENDING')")
        ),
        {"event_id": str(event.id), "organization_id": str(event.organization_id)},
    )
    if live_activation:
        return

    await CapabilityService.sync_catalogue(db)
    plan = await db.scalar(
        select(SubscriptionPlan).where(SubscriptionPlan.name == "Local Load Test Plan")
    )
    if plan is None:
        plan = SubscriptionPlan(
            name="Local Load Test Plan",
            max_events=100,
            max_event_team_members=100,
            max_registrations=200000,
            max_speakers=10000,
            max_sessions=10000,
            max_rooms=1000,
            max_ticket_categories=1000,
            max_badge_templates=1000,
            max_certificate_templates=1000,
            max_emails_per_event=1000000,
            storage_quota_mb=102400,
            is_active=True,
        )
        db.add(plan)
        await db.flush()

    features = (await db.scalars(select(FeatureCatalog).where(FeatureCatalog.is_active.is_(True)))).all()
    existing_feature_ids = set(
        (await db.scalars(select(PlanFeature.feature_id).where(PlanFeature.plan_id == plan.id))).all()
    )
    for feature in features:
        if feature.id in existing_feature_ids:
            continue
        value_type = (feature.value_type or "BOOLEAN").upper()
        if value_type in {"TIER", "ENUM"}:
            value = (feature.allowed_values or [True])[-1]
        elif value_type == "LIMIT":
            value = 200000
        else:
            value = True
        db.add(PlanFeature(
            plan_id=plan.id,
            feature_id=feature.id,
            enabled=True,
            value_type=value_type,
            entitlement_value={"value": value},
            scope_type=feature.scope_type,
            enforcement_mode=feature.enforcement_mode,
        ))
    await db.flush()

    subscription = await db.scalar(
        select(OrganizationSubscription).where(
            OrganizationSubscription.organization_id == event.organization_id,
            OrganizationSubscription.plan_id == plan.id,
            OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"]),
        )
    )
    if subscription is None:
        subscription = OrganizationSubscription(
            organization_id=event.organization_id,
            plan_id=plan.id,
            status="ACTIVE",
        )
        db.add(subscription)
        await db.flush()

    await ActivationService.activate_event(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        subscription_id=subscription.id,
        grant_id=None,
        activation_policy="SNAPSHOT_LOCKED",
        idempotency_key=f"load-fixture-activation-{event.id}",
        actor_id=event.created_by,
    )


async def get_or_create_org(db, slug: str, name: str) -> Organization:
    organization = await db.scalar(select(Organization).where(Organization.slug == slug))
    if organization is None:
        organization = Organization(name=name, slug=slug, is_active=True)
        db.add(organization)
        await db.flush()
    return organization


async def get_or_create_event(db, organization_id, short_code: str, name: str) -> Event:
    # A fixture lookup must respect tenant ownership just like a production
    # query. Stable short codes are only reusable within this fixture's own
    # organization namespace.
    event = await db.scalar(
        select(Event).where(
            Event.organization_id == organization_id,
            Event.short_code == short_code,
        )
    )
    if event is None:
        event = Event(
            organization_id=organization_id,
            name=name,
            short_code=short_code,
            start_date=date.today(),
            end_date=date.today(),
            status="active",
            created_by=None,
        )
        db.add(event)
        await db.flush()
    return event


async def get_or_create_load_actor(db, organization_id) -> User:
    email = "load-test-admin@local.invalid"
    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            organization_id=organization_id,
            email=email,
            password_hash=hash_password("local-load-test-password-not-for-production"),
            first_name="Load",
            last_name="Test Admin",
            role="organiser",
            is_active=True,
            is_2fa_enabled=False,
        )
        db.add(user)
        await db.flush()
    elif user.organization_id != organization_id:
        user.organization_id = organization_id
    return user


async def seed_event_data(db, event: Event, participant_count: int, *, rich: bool) -> None:
    event_id = str(event.id)
    organization_id = str(event.organization_id)
    role_count = 100 if rich else 5

    await db.execute(text("""
        INSERT INTO registration.participant_roles
          (id, event_id, category, name, role_code, is_active, is_default, sort_order, created_at)
        SELECT gen_random_uuid(), :event_id, CASE WHEN n % 4 = 0 THEN 'Presentation Related' ELSE 'Attendee' END,
          'Load Role ' || n, 'LR' || lpad(n::text, 8, '0'), true, n = 1, n, now()
        FROM generate_series(1, :role_count) numbers(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM registration.participant_roles r
          WHERE r.event_id = :event_id AND r.role_code = 'LR' || lpad(n::text, 8, '0')
        )
    """), {"event_id": event_id, "role_count": role_count})

    await db.execute(text("""
        INSERT INTO registration.ticket_types (event_id, role_name, tier_name, price, id)
        SELECT :event_id, 'Load Role ' || n, 'standard', (n * 10)::numeric, gen_random_uuid()
        FROM generate_series(1, :role_count) numbers(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM registration.ticket_types t
          WHERE t.event_id = :event_id AND t.role_name = 'Load Role ' || n AND t.tier_name = 'standard'
        )
    """), {"event_id": event_id, "role_count": role_count})

    fields = [
        {"name": f"load_field_{n}", "type": "text", "required": n % 3 == 0, "order": n}
        for n in range(1, 101 if rich else 6)
    ]
    await db.execute(text("""
        INSERT INTO registration.registration_forms
          (id, event_id, is_live, fields, created_at, updated_at, settings, schema_version, version)
        SELECT gen_random_uuid(), :event_id, true, CAST(:fields AS jsonb), now(), now(), '{}'::jsonb, 1, 1
        WHERE NOT EXISTS (SELECT 1 FROM registration.registration_forms f WHERE f.event_id = :event_id)
    """), {"event_id": event_id, "fields": json.dumps(fields)})

    if rich:
        # A previous small-profile run may already have created the form. Keep
        # repeated large-profile runs deterministic by upgrading that existing
        # projection instead of silently retaining a small field set.
        await db.execute(
            text("""
                UPDATE registration.registration_forms
                SET fields = CAST(:fields AS jsonb), updated_at = now()
                WHERE event_id = :event_id
            """),
            {"event_id": event_id, "fields": json.dumps(fields)},
        )

    if participant_count:
        await db.execute(text("""
            INSERT INTO registration.participants
              (id, event_id, regno, first_name, last_name, email, roles, approval_status, paid_status,
               badge_status, checkin_status, source, custom_fields, registered_at, updated_at)
            SELECT gen_random_uuid(), :event_id, 'LOAD-' || n, 'Load', 'Participant ' || n,
              'load-' || n || '@local.invalid', jsonb_build_array('Load Role ' || ((n - 1) % :role_count + 1)),
              CASE WHEN n % 5 = 0 THEN 'Pending' ELSE 'Approved' END,
              CASE WHEN n % 3 = 0 THEN 'Paid' ELSE 'Unpaid' END, 'Unprinted',
              CASE WHEN n % 10 = 0 THEN 'Checked In' ELSE 'Pending' END, 'load-test',
              jsonb_build_object('load_index', n), now(), now()
            FROM generate_series(1, :count) numbers(n)
            WHERE NOT EXISTS (
              SELECT 1 FROM registration.participants p
              WHERE p.event_id = :event_id AND p.email = 'load-' || n || '@local.invalid'
            )
        """), {"event_id": event_id, "count": participant_count, "role_count": role_count})

        await db.execute(text("""
            INSERT INTO registration.registrations
              (id, event_id, participant_id, registration_status, registration_data, submitted_at, approval_source)
            SELECT gen_random_uuid(), p.event_id, p.id,
              CASE WHEN right(p.regno, 1) = '0' THEN 'pending_review' ELSE 'approved' END,
              jsonb_build_object('email', p.email, 'name', p.first_name || ' ' || p.last_name,
                                  'role', 'Load Role ' || ((row_number() over (order by p.regno) - 1) % :role_count + 1)),
              now(), 'load-fixture'
            FROM registration.participants p
            WHERE p.event_id = :event_id AND p.source = 'load-test'
              AND NOT EXISTS (SELECT 1 FROM registration.registrations r WHERE r.participant_id = p.id)
        """), {"event_id": event_id, "role_count": role_count})

        await db.execute(text("""
            INSERT INTO registration.payment_transactions
              (id, event_id, registration_id, amount, currency, status, payment_method,
               gateway_order_id, discount_applied, created_at, updated_at)
            SELECT gen_random_uuid(), r.event_id, r.id, 1000 + (row_number() over (order by r.id) % 500),
              'INR', CASE WHEN row_number() over (order by r.id) % 4 = 0 THEN 'pending' ELSE 'success' END,
              'load-fixture', 'LOAD-ORDER-' || r.id, 0, now(), now()
            FROM registration.registrations r
            WHERE r.event_id = :event_id AND r.approval_source = 'load-fixture'
              AND NOT EXISTS (SELECT 1 FROM registration.payment_transactions p WHERE p.registration_id = r.id)
            LIMIT :payment_count
        """), {"event_id": event_id, "payment_count": min(10000, participant_count)})

    if rich:
        # Keep the large profile useful for badge and import-history query
        # plans as well as portal reads. Stable keys make reruns idempotent.
        await db.execute(text("""
            INSERT INTO registration.badges
              (id, participant_id, badge_code, qr_token, barcode, status, created_at, updated_at)
            SELECT gen_random_uuid(), p.id,
              'LB-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-' || n,
              'LQ-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-' || n,
              'LBR-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-' || n,
              CASE WHEN n % 4 = 0 THEN 'printed' ELSE 'created' END, now(), now()
            FROM (
              SELECT p.id, row_number() OVER (ORDER BY p.regno) AS n
              FROM registration.participants p
              WHERE p.event_id = CAST(:event_id AS uuid) AND p.source = 'load-test'
              ORDER BY p.regno
              LIMIT 10000
            ) p
            WHERE NOT EXISTS (
              SELECT 1 FROM registration.badges b
              WHERE b.badge_code = 'LB-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-' || p.n
            )
        """), {"event_id": event_id})

        await db.execute(text("""
            INSERT INTO registration.badge_history
              (id, badge_id, action, metadata, created_at)
            SELECT gen_random_uuid(), b.id, 'created', '{}'::jsonb, now()
            FROM registration.badges b
            WHERE b.badge_code LIKE 'LB-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-%'
              AND NOT EXISTS (
                SELECT 1 FROM registration.badge_history h
                WHERE h.badge_id = b.id AND h.action = 'created'
              )
        """), {"event_id": event_id})

        await db.execute(text("""
            INSERT INTO registration.import_jobs
              (id, event_id, filename, storage_path, job_type, status,
               rows_total, rows_imported, rows_failed, rows_updated,
               sessions_created, speakers_created, rooms_created, created_at)
            SELECT gen_random_uuid(), CAST(:event_id AS uuid),
              'load-job-' || n || '-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '.xlsx',
              'load-fixture/imports/' || CAST(:event_id AS text) || '/' || n || '.xlsx',
              CASE WHEN n % 3 = 0 THEN 'eposter' ELSE 'schedule' END,
              CASE n % 4 WHEN 0 THEN 'completed' WHEN 1 THEN 'failed' WHEN 2 THEN 'importing' ELSE 'uploaded' END,
              1000, CASE WHEN n % 4 = 0 THEN 1000 ELSE n * 10 END,
              CASE WHEN n % 4 = 1 THEN 10 ELSE 0 END, n,
              n % 20, n % 50, n % 10, now() - (n || ' minutes')::interval
            FROM generate_series(1, 10000) numbers(n)
            WHERE NOT EXISTS (
              SELECT 1 FROM registration.import_jobs j
              WHERE j.event_id = CAST(:event_id AS uuid)
                AND j.filename = 'load-job-' || n || '-' || substr(md5(CAST(:event_id AS text)), 1, 8) || '.xlsx'
            )
              AND :participant_count > 0
        """), {"event_id": event_id, "participant_count": participant_count})

        await db.execute(text("""
            INSERT INTO speakers.speakers
              (id, event_id, first_name, last_name, email, designation, affiliation, country,
               speaker_code, upload_token, upload_status, allow_override, role, created_at, updated_at)
            SELECT gen_random_uuid(), CAST(:event_id AS uuid), 'Speaker', n, 'speaker-' || n || '-' || CAST(:event_id AS text) || '@local.invalid',
              'Presenter', 'Load Institute', 'IN',
              'L' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-' || lpad(n::text, 8, '0'),
              md5(CAST(:event_id AS text) || ':speaker:' || n), 'pending', false, 'Speaker', now(), now()
            FROM generate_series(1, 1000) numbers(n)
            WHERE NOT EXISTS (
              SELECT 1 FROM speakers.speakers s
              WHERE s.event_id = CAST(:event_id AS uuid)
                AND s.speaker_code = 'L' || substr(md5(CAST(:event_id AS text)), 1, 8) || '-' || lpad(n::text, 8, '0')
            )
        """), {"event_id": event_id})

        await db.execute(text("""
            INSERT INTO agenda.sessions
              (id, event_id, session_code, title, session_type, start_time, end_time, status, is_published, created_at, updated_at)
            SELECT gen_random_uuid(), :event_id, 'LOAD-SESSION-' || n, 'Load Session ' || n,
              'talk', now() + (n || ' minutes')::interval, now() + ((n + 45) || ' minutes')::interval,
              'scheduled', true, now(), now()
            FROM generate_series(1, 1000) numbers(n)
            WHERE NOT EXISTS (
              SELECT 1 FROM agenda.sessions s
              WHERE s.event_id = CAST(:event_id AS uuid) AND s.session_code = 'LOAD-SESSION-' || n
            )
        """), {"event_id": event_id})

        await db.execute(text("""
            INSERT INTO content.durable_uploads
              (id, organization_id, event_id, object_key, original_filename, mime_type, size_bytes, checksum, status, created_at, completed_at)
            SELECT gen_random_uuid(), CAST(:organization_id AS uuid), CAST(:event_id AS uuid),
              'tenant/' || CAST(:organization_id AS text) || '/event/' || CAST(:event_id AS text) || '/load/' || n || '.bin',
              'load-' || n || '.bin', 'application/octet-stream', 1024 + n,
              md5('load-' || n), CASE n % 5 WHEN 0 THEN 'ready' WHEN 1 THEN 'processing' WHEN 2 THEN 'failed' WHEN 3 THEN 'quarantined' ELSE 'uploaded' END,
              now(), CASE WHEN n % 5 = 0 THEN now() ELSE NULL END
            FROM generate_series(1, 10000) numbers(n)
            WHERE NOT EXISTS (
              SELECT 1 FROM content.durable_uploads u WHERE u.object_key =
                'tenant/' || CAST(:organization_id AS text) || '/event/' || CAST(:event_id AS text) || '/load/' || n || '.bin'
            )
        """), {"organization_id": organization_id, "event_id": event_id})

        await db.execute(text("""
            INSERT INTO presentations.files
              (id, speaker_id, session_speaker_id, event_id, original_filename, stored_filename, storage_path,
               file_size_bytes, mime_type, file_format, version_number, is_current_version, upload_source,
               upload_status, is_locked, local_sync_status, uploaded_at, created_at)
            SELECT gen_random_uuid(), s.id, gen_random_uuid(), s.event_id, 'load-' || n || '.pptx',
              'load-' || n || '.pptx', 'load-fixture/' || s.event_id || '/' || n,
              2048 + n, 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'pptx', 1, true, 'api',
              CASE n % 5 WHEN 0 THEN 'approved' WHEN 1 THEN 'processing' WHEN 2 THEN 'rejected' ELSE 'pending_validation' END,
              false, 'pending', now(), now()
            FROM generate_series(1, 10000) numbers(n)
            JOIN LATERAL (
              SELECT id, event_id FROM speakers.speakers
              WHERE event_id = CAST(:event_id AS uuid)
              ORDER BY speaker_code
              OFFSET ((n - 1) % 1000) LIMIT 1
            ) s ON true
            WHERE NOT EXISTS (
              SELECT 1 FROM presentations.files f
              WHERE f.event_id = CAST(:event_id AS uuid) AND f.original_filename = 'load-' || n || '.pptx'
            )
        """), {"event_id": event_id})

        await db.execute(text("""
            INSERT INTO presentations.processing_jobs (id, file_id, status, logs, created_at)
            SELECT gen_random_uuid(), f.id,
              CASE f.upload_status WHEN 'approved' THEN 'completed' WHEN 'rejected' THEN 'failed' ELSE f.upload_status END,
              jsonb_build_object('source', 'load-fixture'), now()
            FROM presentations.files f
            WHERE f.event_id = CAST(:event_id AS uuid) AND f.original_filename LIKE 'load-%.pptx'
              AND NOT EXISTS (SELECT 1 FROM presentations.processing_jobs j WHERE j.file_id = f.id)
        """), {"event_id": event_id})


async def main(profile: str, output_path: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        organization = await get_or_create_org(db, "local-load-test", "Local Load Test")
        load_actor = await get_or_create_load_actor(db, organization.id)
        if profile == "cross-tenant":
            other = await get_or_create_org(db, "local-load-test-other", "Local Load Test Other Tenant")
            event = await get_or_create_event(db, other.id, "LOADOTHER", "Cross Tenant Load Event")
            await seed_event_data(db, event, 100, rich=False)
            await db.commit()
            result = {
                "profile": profile,
                "organization_id": str(other.id),
                "event_id": str(event.id),
                "events": 1,
                "participants_target": 100,
                "secondary_tenant": False,
            }
            rendered = json.dumps(result, indent=2)
            print(rendered)
            if output_path:
                with open(output_path, "w", encoding="utf-8") as report:
                    report.write(rendered + "\n")
            return

        event_count = 10 if profile == "large" else 1
        participant_count = 100000 if profile == "large" else 1000
        events = []
        for index in range(event_count):
            code = "LOADTEST" if index == 0 else f"LOADTEST-{index:02d}"
            event = await get_or_create_event(db, organization.id, code, f"Local Load Test Event {index + 1}")
            if event.created_by is None:
                event.created_by = load_actor.id
            await seed_event_data(db, event, participant_count if index == 0 else 0, rich=profile == "large")
            events.append(event)
        if profile in {"small", "large"}:
            await ensure_registration_entitlement(db, events[0])
        if profile == "large":
            # Keep one additional tenant in the large profile so cache and
            # tenant-boundary tests run against a dataset larger than one
            # organization without duplicating the full 100k-row workload.
            other = await get_or_create_org(
                db,
                "local-load-test-secondary",
                "Local Load Test Secondary",
            )
            other_event = await get_or_create_event(
                db,
                other.id,
                "LOADOTHER-LARGE",
                "Local Load Test Secondary Event",
            )
            await seed_event_data(db, other_event, 0, rich=False)
        await db.commit()
        result = {
            "profile": profile,
            "organization_id": str(organization.id),
            "event_id": str(events[0].id),
            "events": len(events),
            "participants_target": participant_count,
            "secondary_tenant": profile == "large",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        rendered = json.dumps(result, indent=2)
        print(rendered)
        if output_path:
            with open(output_path, "w", encoding="utf-8") as report:
                report.write(rendered + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("small", "large", "cross-tenant"), required=True)
    parser.add_argument("--output", default=None, help="Optional JSON manifest path for the generated fixture")
    args = parser.parse_args()
    asyncio.run(main(args.profile, args.output))
