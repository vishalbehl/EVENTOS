"""Reviewed ownership constraints shared by deployment inspection and validation."""
OWNERSHIP_CONSTRAINTS = (
    ("platform", "organizations", "ck_organization_archive_state"),
    ("events", "events", "fk_event_workspace_owner"),
    ("events", "events", "ck_event_workspace_required"),
    ("communications", "campaign_recipient_snapshots", "fk_campaign_snapshot_event_owner"),
    ("communications", "campaign_recipient_snapshots", "fk_campaign_snapshot_campaign_owner"),
    ("communications", "campaign_attempts", "fk_campaign_attempt_snapshot_owner"),
    ("communications", "campaign_attempt_outcomes", "fk_campaign_outcome_attempt_owner"),
    ("communications", "email_logs", "fk_email_log_attempt_owner"),
    ("organizer_access", "organization_teams", "fk_team_owner_tenant"),
    ("organizer_access", "organization_team_members", "fk_team_member_team_tenant"),
    ("organizer_access", "organization_team_members", "fk_team_member_subject_tenant"),
    ("organizer_access", "organization_team_events", "fk_team_event_team_tenant"),
    ("organizer_access", "organization_team_events", "fk_team_event_resource_tenant"),
    ("organizer_access", "emc_client_delegations", "fk_delegation_event_tenant"),
)
PHASE1_OWNERSHIP_CONSTRAINTS = tuple(item for item in OWNERSHIP_CONSTRAINTS
    if item[0] in {"platform", "events", "organizer_access"})
