"""add registration execution mirror schema

Revision ID: 20260808_1000
Revises: 20260806_0950
Create Date: 2026-08-08
"""

from alembic import op


revision = "20260808_1000"
down_revision = "20260806_0950"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS identity")
    op.execute("CREATE SCHEMA IF NOT EXISTS venue")
    op.execute("CREATE SCHEMA IF NOT EXISTS registration")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS identity.organizations (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) NOT NULL UNIQUE
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_identity_organizations_slug ON identity.organizations(slug)")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'trial'")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS identity.venue_users (
            id UUID PRIMARY KEY,
            organization_id UUID,
            username VARCHAR(120) NOT NULL UNIQUE,
            email VARCHAR(320) NOT NULL UNIQUE,
            first_name VARCHAR(150) NOT NULL DEFAULT 'Venue',
            last_name VARCHAR(150) NOT NULL DEFAULT 'Administrator',
            phone VARCHAR(30),
            password_hash VARCHAR(512) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'admin',
            allowed_modes JSONB NOT NULL DEFAULT '["admin"]'::jsonb,
            mode_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
            notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_identity_venue_users_username ON identity.venue_users(username)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_identity_venue_users_email ON identity.venue_users(email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_identity_venue_users_role ON identity.venue_users(role)")
    op.execute("ALTER TABLE events.events ADD COLUMN IF NOT EXISTS speaker_settings JSONB NOT NULL DEFAULT '{\"enabled\": true}'::jsonb")
    op.execute("ALTER TABLE events.events ADD COLUMN IF NOT EXISTS registration_settings JSONB NOT NULL DEFAULT '{\"enabled\": true}'::jsonb")
    op.execute("ALTER TABLE events.events ADD COLUMN IF NOT EXISTS branding_settings JSONB NOT NULL DEFAULT '{\"theme_color\": \"#1A73E8\"}'::jsonb")
    op.execute("UPDATE events.events SET speaker_settings = COALESCE(licensing_details->'speaker_settings', speaker_settings) WHERE licensing_details IS NOT NULL")
    op.execute("UPDATE events.events SET registration_settings = COALESCE(licensing_details->'registration_settings', registration_settings) WHERE licensing_details IS NOT NULL")
    op.execute("UPDATE events.events SET branding_settings = COALESCE(licensing_details->'branding_settings', branding_settings) WHERE licensing_details IS NOT NULL")
    op.execute("ALTER TABLE registration.participants ADD COLUMN IF NOT EXISTS name VARCHAR(320)")
    op.execute("ALTER TABLE registration.participants ADD COLUMN IF NOT EXISTS role VARCHAR(150)")
    op.execute("UPDATE registration.participants SET name = COALESCE(name, NULLIF(trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''))")
    op.execute("UPDATE registration.participants SET role = COALESCE(role, 'Delegate')")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.printers (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            ip_address VARCHAR(50) NOT NULL,
            location VARCHAR(150) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'offline'
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.room_devices (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            room_id UUID,
            device_type VARCHAR(50) NOT NULL,
            device_name VARCHAR(100) NOT NULL,
            hostname VARCHAR(100),
            ip_address INET,
            mac_address MACADDR,
            os_version VARCHAR(100),
            app_version VARCHAR(30),
            status VARCHAR(30) NOT NULL DEFAULT 'offline',
            last_heartbeat_at TIMESTAMPTZ,
            registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_room_devices_event_id ON venue.room_devices(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_room_devices_room_id ON venue.room_devices(room_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_room_devices_device_type ON venue.room_devices(device_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_room_devices_status ON venue.room_devices(status)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.print_templates (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            template_name VARCHAR(255) NOT NULL,
            template_type VARCHAR(50) NOT NULL DEFAULT 'badge',
            template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.badges (
            id UUID PRIMARY KEY,
            participant_id UUID NOT NULL,
            badge_code VARCHAR(50) NOT NULL,
            qr_token VARCHAR(255) NOT NULL,
            barcode VARCHAR(100) NOT NULL,
            nfc_uid VARCHAR(50),
            template_id UUID,
            status VARCHAR(30) NOT NULL DEFAULT 'created',
            issued_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_badges_badge_code ON venue.badges(badge_code)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_badges_qr_token ON venue.badges(qr_token)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_badges_participant_id ON venue.badges(participant_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.badge_history (
            id UUID PRIMARY KEY,
            badge_id UUID NOT NULL,
            action VARCHAR(50) NOT NULL,
            performed_by UUID,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_badge_history_badge_id ON venue.badge_history(badge_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.badge_print_jobs (
            id UUID PRIMARY KEY,
            badge_id UUID NOT NULL,
            printer_id UUID,
            status VARCHAR(30) NOT NULL DEFAULT 'queued',
            queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            printed_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_badge_print_jobs_badge_id ON venue.badge_print_jobs(badge_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.venue_checkin_gates (
            id UUID PRIMARY KEY,
            gate_name VARCHAR(255) NOT NULL,
            gate_type VARCHAR(100) NOT NULL DEFAULT 'Room',
            allowed_roles JSONB NOT NULL DEFAULT '["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"]'::jsonb,
            max_checkins_per_delegate INTEGER NOT NULL DEFAULT 0,
            gate_capacity INTEGER NOT NULL DEFAULT 500,
            updated_by VARCHAR(150),
            updated_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkin_gates_gate_name ON venue.venue_checkin_gates(gate_name)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.venue_checkins (
            id UUID PRIMARY KEY,
            event_id UUID,
            participant_id UUID,
            companion_id UUID,
            checkin_gate_id UUID,
            gate_name VARCHAR(255) NOT NULL DEFAULT 'Initial Participant Check-In Gate',
            gate_type VARCHAR(100) NOT NULL DEFAULT 'Main Entrance Intake',
            gate_capacity INTEGER NOT NULL DEFAULT 5000,
            badge_code VARCHAR(100) NOT NULL DEFAULT '',
            scan_type VARCHAR(50) NOT NULL DEFAULT 'check_in',
            status VARCHAR(50) NOT NULL DEFAULT 'success',
            rejection_reason TEXT,
            admin_overridden_by VARCHAR(150),
            checkin_time TIMESTAMPTZ NOT NULL DEFAULT now(),
            checkout_time TIMESTAMPTZ,
            duration INTEGER,
            session_id UUID,
            method VARCHAR(50) NOT NULL DEFAULT 'qr',
            device_id VARCHAR(100) NOT NULL DEFAULT 'unknown',
            operation_id VARCHAR(120),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_event_id ON venue.venue_checkins(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_participant_id ON venue.venue_checkins(participant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_companion_id ON venue.venue_checkins(companion_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_checkin_gate_id ON venue.venue_checkins(checkin_gate_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_operation_id ON venue.venue_checkins(operation_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.venue_scan_events (
            id UUID PRIMARY KEY,
            event_id UUID,
            participant_id UUID,
            companion_id UUID,
            checkin_gate_id UUID,
            badge_id UUID,
            station_name VARCHAR(255) NOT NULL DEFAULT 'Main Gate',
            station_type VARCHAR(100) NOT NULL DEFAULT 'Room',
            location VARCHAR(150),
            badge_code VARCHAR(100) NOT NULL DEFAULT '',
            scan_type VARCHAR(50) NOT NULL DEFAULT 'check_in',
            status VARCHAR(50) NOT NULL DEFAULT 'success',
            rejection_reason TEXT,
            admin_overridden_by VARCHAR(150),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_scan_events_event_id ON venue.venue_scan_events(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_scan_events_participant_id ON venue.venue_scan_events(participant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_scan_events_companion_id ON venue.venue_scan_events(companion_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_scan_events_checkin_gate_id ON venue.venue_scan_events(checkin_gate_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.node_assignments (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            device_id UUID NOT NULL,
            mode VARCHAR(50) NOT NULL,
            station_id VARCHAR(150),
            checkin_gate_id UUID,
            permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            snapshot_version INTEGER NOT NULL DEFAULT 1,
            last_sync_at TIMESTAMPTZ,
            last_heartbeat_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ,
            revoked_reason TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("ALTER TABLE venue.node_assignments ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ")
    op.execute("ALTER TABLE venue.node_assignments ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ")
    op.execute("ALTER TABLE venue.node_assignments ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ")
    op.execute("ALTER TABLE venue.node_assignments ADD COLUMN IF NOT EXISTS revoked_reason TEXT")
    op.execute("ALTER TABLE venue.node_assignments ADD COLUMN IF NOT EXISTS created_by UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_node_assignments_event_id ON venue.node_assignments(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_node_assignments_device_id ON venue.node_assignments(device_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_node_assignments_checkin_gate_id ON venue.node_assignments(checkin_gate_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_node_event_device ON venue.node_assignments(event_id, device_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.node_operations (
            id UUID PRIMARY KEY,
            operation_id VARCHAR(120) NOT NULL UNIQUE,
            assignment_id UUID NOT NULL,
            event_id UUID NOT NULL,
            action VARCHAR(60) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            occurred_at TIMESTAMPTZ NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'received',
            conflict_reason TEXT,
            received_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("ALTER TABLE venue.node_operations ADD COLUMN IF NOT EXISTS operation_id VARCHAR(120)")
    op.execute("ALTER TABLE venue.node_operations ADD COLUMN IF NOT EXISTS event_id UUID")
    op.execute("ALTER TABLE venue.node_operations ADD COLUMN IF NOT EXISTS action VARCHAR(60)")
    op.execute("ALTER TABLE venue.node_operations ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ")
    op.execute("ALTER TABLE venue.node_operations ADD COLUMN IF NOT EXISTS conflict_reason TEXT")
    op.execute("ALTER TABLE venue.node_operations ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_node_operations_assignment_id ON venue.node_operations(assignment_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_node_operations_event_id ON venue.node_operations(event_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_venue_node_operations_operation_id ON venue.node_operations(operation_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.kits (
            id UUID PRIMARY KEY,
            kit_name VARCHAR(150) NOT NULL UNIQUE,
            category VARCHAR(50) NOT NULL DEFAULT 'Delegate',
            total_quantity INTEGER NOT NULL DEFAULT 1000,
            distributed_quantity INTEGER NOT NULL DEFAULT 0,
            max_per_participant INTEGER NOT NULL DEFAULT 1,
            description VARCHAR(255),
            target_roles JSONB NOT NULL DEFAULT '["All"]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.participant_kits (
            id UUID PRIMARY KEY,
            participant_id UUID NOT NULL,
            kit_id UUID NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'Issued',
            issued_by VARCHAR(100) NOT NULL DEFAULT 'REG-DESK-01',
            issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_participant_kits_participant_id ON venue.participant_kits(participant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_participant_kits_kit_id ON venue.participant_kits(kit_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.sync_outbox (
            id UUID PRIMARY KEY,
            entity_type VARCHAR(50) NOT NULL,
            entity_id UUID NOT NULL,
            action VARCHAR(30) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            error_message TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            synced_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_sync_outbox_status ON venue.sync_outbox(status)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.participant_action_logs (
            id UUID PRIMARY KEY,
            participant_id UUID NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            performed_by VARCHAR(100) NOT NULL DEFAULT 'REG-DESK-01',
            details TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_participant_action_logs_participant_id ON venue.participant_action_logs(participant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_participant_action_logs_action_type ON venue.participant_action_logs(action_type)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.network_configurations (
            id UUID PRIMARY KEY,
            active_adapter_name VARCHAR(100) NOT NULL,
            adapter_description VARCHAR(200),
            media_type VARCHAR(30) DEFAULT 'Ethernet',
            ip_address VARCHAR(50),
            subnet VARCHAR(50),
            gateway VARCHAR(50),
            mac_address VARCHAR(50),
            is_active BOOLEAN DEFAULT true,
            updated_at TIMESTAMPTZ DEFAULT now()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.event_report_snapshots (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            version INTEGER NOT NULL,
            report_data JSONB NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            created_by UUID NOT NULL,
            supersedes_id UUID,
            revision_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_event_report_snapshot_version ON venue.event_report_snapshots(event_id, version)")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS venue.event_report_audit (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            snapshot_id UUID,
            actor_user_id UUID NOT NULL,
            action VARCHAR(50) NOT NULL,
            export_format VARCHAR(10),
            data_scope VARCHAR(50) NOT NULL DEFAULT 'full_pii',
            content_hash VARCHAR(64),
            details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_event_report_audit_event_id ON venue.event_report_audit(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_event_report_audit_action ON venue.event_report_audit(action)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_event_report_audit_created_at ON venue.event_report_audit(created_at)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.companions (
            id UUID PRIMARY KEY,
            event_id UUID,
            primary_participant_id UUID NOT NULL,
            first_name VARCHAR(150) NOT NULL,
            last_name VARCHAR(150) NOT NULL DEFAULT '',
            relationship VARCHAR(50) NOT NULL DEFAULT 'Spouse',
            email VARCHAR(320),
            phone VARCHAR(30),
            badge_code VARCHAR(50),
            badge_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            checked_in BOOLEAN DEFAULT false,
            checked_in_at TIMESTAMPTZ,
            dietary_preference VARCHAR(50),
            special_assistance VARCHAR(100),
            notes VARCHAR(500),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("ALTER TABLE registration.companions ADD COLUMN IF NOT EXISTS event_id UUID")
    op.execute("ALTER TABLE registration.companions ADD COLUMN IF NOT EXISTS badge_code VARCHAR(50)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_companions_event_id ON registration.companions(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_companions_badge_code ON registration.companions(badge_code)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_companions_primary_participant_id ON registration.companions(primary_participant_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.participant_roles (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            category VARCHAR(100) NOT NULL DEFAULT 'General',
            name VARCHAR(150) NOT NULL,
            role_code VARCHAR(10) NOT NULL DEFAULT 'REG',
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_default BOOLEAN NOT NULL DEFAULT false,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_roles_event_id ON registration.participant_roles(event_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.participant_registrations (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            participant_id UUID,
            registration_status VARCHAR(50) NOT NULL DEFAULT 'submitted',
            registration_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            reviewed_by UUID,
            reviewed_at TIMESTAMPTZ,
            review_notes TEXT,
            waitlist_position INTEGER,
            rejection_reason TEXT,
            approval_source VARCHAR(50) NOT NULL DEFAULT 'portal'
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_registrations_event_id ON registration.participant_registrations(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_registrations_participant_id ON registration.participant_registrations(participant_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.participant_extensions (
            id UUID PRIMARY KEY,
            participant_id UUID NOT NULL UNIQUE,
            department VARCHAR(150),
            city VARCHAR(100),
            dietary_preference VARCHAR(100) DEFAULT 'Vegetarian',
            emergency_contact VARCHAR(100),
            notes VARCHAR(500),
            custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_extensions_participant_id ON registration.participant_extensions(participant_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS venue.node_operations")
    op.execute("DROP TABLE IF EXISTS venue.node_assignments")
    op.execute("DROP TABLE IF EXISTS venue.venue_scan_events")
    op.execute("DROP TABLE IF EXISTS venue.venue_checkins")
    op.execute("DROP TABLE IF EXISTS venue.venue_checkin_gates")
    op.execute("DROP TABLE IF EXISTS venue.badge_print_jobs")
    op.execute("DROP TABLE IF EXISTS venue.badge_history")
    op.execute("DROP TABLE IF EXISTS venue.badges")
    op.execute("DROP TABLE IF EXISTS venue.print_templates")
    op.execute("DROP TABLE IF EXISTS venue.printers")
