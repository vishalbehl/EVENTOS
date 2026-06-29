"""cleanup_obsolete_schemas

Revision ID: 86af6b6460d0
Revises: a997947de4ef
Create Date: 2026-06-28 17:25:28.311872+00:00

"""
from typing import Sequence, Union
import hashlib
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '86af6b6460d0'
down_revision: Union[str, None] = 'a997947de4ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Data Migration: Copy data from platform_audit.audit_logs to audit.logs
    bind = op.get_bind()
    
    # Check if platform_audit schema and audit_logs table exist
    res = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'platform_audit' 
            AND table_name = 'audit_logs'
        );
    """))
    
    if res.scalar():
        # Fetch rows
        rows_res = bind.execute(sa.text("""
            SELECT id, request_id, correlation_id, organization_id, performed_by, 
                   entity_type, entity_id, action, old_values, new_values, 
                   ip_address, user_agent, performed_at 
            FROM platform_audit.audit_logs
        """))
        rows = rows_res.fetchall()
        
        for r in rows:
            occurred_at = r.performed_at
            resource_id = str(r.entity_id) if r.entity_id else ""
            action_type = r.action or ""
            timestamp = occurred_at.isoformat() if hasattr(occurred_at, "isoformat") else str(occurred_at)
            payload = f"audit:logs:{resource_id}:{action_type}:{timestamp}"
            row_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
            
            # Verify foreign key dependencies exist before inserting
            org_id = r.organization_id
            if org_id:
                org_check = bind.execute(sa.text("SELECT 1 FROM platform.organizations WHERE id = :id"), {"id": org_id}).scalar()
                if not org_check:
                    org_id = None
                    
            user_id = r.performed_by
            if user_id:
                user_check = bind.execute(sa.text("SELECT 1 FROM identity.users WHERE id = :id"), {"id": user_id}).scalar()
                if not user_check:
                    user_id = None

            bind.execute(sa.text("""
                INSERT INTO audit.logs (
                    id, request_id, correlation_id, organization_id, actor_user_id, 
                    resource_type, resource_id, action_type, old_state, new_state, 
                    actor_ip, actor_user_agent, row_hash, is_sensitive, occurred_at
                ) VALUES (
                    :id, :request_id, :correlation_id, :organization_id, :actor_user_id, 
                    :resource_type, :resource_id, :action_type, :old_state, :new_state, 
                    :actor_ip, :actor_user_agent, :row_hash, :is_sensitive, :occurred_at
                ) ON CONFLICT (id) DO NOTHING;
            """), {
                "id": r.id,
                "request_id": r.request_id,
                "correlation_id": r.correlation_id,
                "organization_id": org_id,
                "actor_user_id": user_id,
                "resource_type": r.entity_type,
                "resource_id": r.entity_id,
                "action_type": r.action,
                "old_state": r.old_values,
                "new_state": r.new_values,
                "actor_ip": r.ip_address,
                "actor_user_agent": r.user_agent,
                "row_hash": row_hash,
                "is_sensitive": False,
                "occurred_at": occurred_at
            })

    # 2. Rename integrations.sync_jobs and integrations.sync_history
    # to avoid conflict in alembic when dropping
    sync_jobs_exists = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'integrations' 
            AND table_name = 'sync_jobs'
        );
    """)).scalar()
    if sync_jobs_exists:
        op.execute("ALTER TABLE integrations.sync_jobs RENAME TO integration_sync_jobs")
        
    sync_history_exists = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'integrations' 
            AND table_name = 'sync_history'
        );
    """)).scalar()
    if sync_history_exists:
        op.execute("ALTER TABLE integrations.sync_history RENAME TO integration_sync_history")

    # 3. Drop obsolete tables
    op.execute("DROP TABLE IF EXISTS integrations.integration_sync_jobs CASCADE")
    op.execute("DROP TABLE IF EXISTS integrations.integration_sync_history CASCADE")
    op.execute("DROP TABLE IF EXISTS integrations.marketplace_apps CASCADE")
    
    op.execute("DROP TABLE IF EXISTS ai.ai_actions CASCADE")
    op.execute("DROP TABLE IF EXISTS applications.app_features CASCADE")
    op.execute("DROP TABLE IF EXISTS applications.app_permissions CASCADE")
    op.execute("DROP TABLE IF EXISTS applications.app_audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS applications.device_apps CASCADE")
    op.execute("DROP TABLE IF EXISTS audit.security_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS billing.marketplace_subscriptions CASCADE")
    op.execute("DROP TABLE IF EXISTS billing.marketplace_transactions CASCADE")
    op.execute("DROP TABLE IF EXISTS blueprints.blueprint_installations CASCADE")
    op.execute("DROP TABLE IF EXISTS commercial.staff_skills CASCADE")
    op.execute("DROP TABLE IF EXISTS developer.api_usage CASCADE")
    op.execute("DROP TABLE IF EXISTS developer.api_audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS developer.sdk_versions CASCADE")
    op.execute("DROP TABLE IF EXISTS events.room_allocations CASCADE")
    op.execute("DROP TABLE IF EXISTS identity.system_error_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS identity.api_keys CASCADE")
    op.execute("DROP TABLE IF EXISTS templates.template_marketplace_categories CASCADE")
    op.execute("DROP TABLE IF EXISTS crm.interactions CASCADE")
    op.execute("DROP TABLE IF EXISTS deployment_management.deployment_metrics CASCADE")
    op.execute("DROP TABLE IF EXISTS deployment_management.project_actual_costs CASCADE")
    op.execute("DROP TABLE IF EXISTS deployment_management.service_metrics CASCADE")
    op.execute("DROP TABLE IF EXISTS deployment_management.resource_metrics CASCADE")

    # Drop platform_notifications (except notification_templates)
    op.execute("DROP TABLE IF EXISTS platform_notifications.notification_events CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_notifications.notification_deliveries CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_notifications.in_app_notifications CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_notifications.notification_attachments CASCADE")

    # Drop platform permissions & role permissions
    op.execute("DROP TABLE IF EXISTS platform.permissions CASCADE")
    op.execute("DROP TABLE IF EXISTS platform.role_permissions CASCADE")

    # Drop rbac permission tables
    op.execute("DROP TABLE IF EXISTS rbac.permission_groups CASCADE")
    op.execute("DROP TABLE IF EXISTS rbac.permission_sets CASCADE")
    op.execute("DROP TABLE IF EXISTS rbac.application_permissions CASCADE")
    op.execute("DROP TABLE IF EXISTS rbac.feature_permissions CASCADE")
    op.execute("DROP TABLE IF EXISTS rbac.user_access_nodes CASCADE")

    # Drop entire schemas
    op.execute("DROP SCHEMA IF EXISTS platform_activity CASCADE")
    op.execute("DROP SCHEMA IF EXISTS platform_alerts CASCADE")
    op.execute("DROP SCHEMA IF EXISTS platform_audit CASCADE")
    op.execute("DROP SCHEMA IF EXISTS platform_compliance CASCADE")
    op.execute("DROP SCHEMA IF EXISTS platform_webhooks CASCADE")
    op.execute("DROP SCHEMA IF EXISTS platform_workflows CASCADE")
    op.execute("DROP SCHEMA IF EXISTS design_system CASCADE")
    op.execute("DROP SCHEMA IF EXISTS jobs CASCADE")
    op.execute("DROP SCHEMA IF EXISTS theme_engine CASCADE")
    op.execute("DROP SCHEMA IF EXISTS marketplace CASCADE")


def downgrade() -> None:
    pass
