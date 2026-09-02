from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TenantTable:
    schema: str
    table: str
    ownership_column: str = "organization_id"
    rollout_stage: str = "CANARY"
    ownership_strategy: str = "DIRECT"

    @property
    def fullname(self) -> str:
        return f"{self.schema}.{self.table}"

    @property
    def policy_name(self) -> str:
        return f"tenant_isolation_{self.table}"


# Phase 1 starts with direct organization-owned control-plane and event-root
# tables. Child tables reached only through event_id require a separate policy
# strategy and are deliberately not inferred here.
TENANT_TABLES: tuple[TenantTable, ...] = (
    TenantTable("events", "events"),
    TenantTable("commerce", "organization_subscriptions"),
    TenantTable("commerce", "entitlement_grants"),
    TenantTable("commerce", "grant_consumptions"),
    TenantTable("commerce", "event_activations"),
    TenantTable("commerce", "event_entitlement_snapshot_sets"),
    TenantTable("commerce", "operation_requests"),
    TenantTable("technology_services", "service_requests"),
    TenantTable("search", "search_indexes"),
    TenantTable("search", "search_jobs"),
    TenantTable("command_center_audit", "data_exports"),
    TenantTable("operations", "job_control_requests"),
    TenantTable("operations", "source_api_keys"),
    TenantTable("content", "durable_uploads"),
)


EVENT_TENANT_TABLES: tuple[TenantTable, ...] = (
    TenantTable("agenda", "rooms", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("agenda", "sessions", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("speakers", "speakers", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("registration", "participants", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("registration", "registrations", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("registration", "ticket_types", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("registration", "participant_roles", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("registration", "payment_transactions", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("registration", "import_jobs", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("presentations", "files", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("presentations", "bundles", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("presentations", "posters", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("access", "user_event_assignments", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("communications", "email_campaigns", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    # Email assets can be global or event-scoped (nullable event_id). Keep them
    # out of the event-root rollout until their mixed-scope policy is explicit.
    TenantTable("communications", "announcements", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("integrations", "webhooks", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("venue", "sync_jobs", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("venue", "srr_stations", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
    TenantTable("venue", "srr_checkins", "event_id", "EVENT_CANARY", "EVENT_ROOT"),
)


DERIVED_TENANT_TABLES: tuple[TenantTable, ...] = (
    TenantTable("search", "search_documents", "index_id", "SEARCH_INDEX_ROOT", "SEARCH_INDEX_ROOT"),
)


MIXED_TENANT_TABLES: tuple[TenantTable, ...] = (
    TenantTable("venue", "printers", "organization_id", "MIXED_CANARY", "DIRECT_REQUIRED_EVENT"),
    TenantTable("commerce", "invoices", "organization_id", "MIXED_CANARY", "DIRECT_OPTIONAL_EVENT"),
    TenantTable("commerce", "organization_addons", "organization_id", "MIXED_CANARY", "DIRECT_OPTIONAL_EVENT"),
    TenantTable("operation_templates", "template_installations", "organization_id", "MIXED_CANARY", "DIRECT_REQUIRED_EVENT"),
    TenantTable("organizer_access", "user_role_assignments", "user_id", "MIXED_CANARY", "USER_OPTIONAL_SCOPE"),
)


ALL_TENANT_TABLES = (
    TENANT_TABLES + EVENT_TENANT_TABLES + DERIVED_TENANT_TABLES + MIXED_TENANT_TABLES
)
TENANT_TABLE_BY_NAME = {item.fullname: item for item in ALL_TENANT_TABLES}
