-- Authorised migration-operator report, never a customer endpoint.
-- row_security=off fails if RLS would filter rows; it is not an RLS bypass.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '60s';

-- Whole-database event reconciliation belongs here, not in a runtime-role
-- preflight where RLS could hide all unassigned or foreign-workspace events.
SELECT count(*) FILTER (WHERE e.operational_workspace_id IS NULL) AS unassigned_events,
       count(*) FILTER (WHERE e.operational_workspace_id IS NOT NULL AND w.id IS NULL)
         AS foreign_or_missing_workspaces
FROM events.events e
LEFT JOIN organizer_access.operational_workspaces w
  ON w.id = e.operational_workspace_id AND w.organization_id = e.organization_id;

WITH conflicts AS (
  SELECT 'team_owner'::text AS issue, t.id AS record_id, t.organization_id
  FROM organizer_access.organization_teams t
  WHERE t.owner_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organizer_access.organization_members m
    WHERE m.organization_id = t.organization_id AND m.id = t.owner_member_id)
  UNION ALL
  SELECT 'team_member_team', b.id, b.organization_id
  FROM organizer_access.organization_team_members b
  WHERE NOT EXISTS (SELECT 1 FROM organizer_access.organization_teams t
    WHERE t.organization_id = b.organization_id AND t.id = b.team_id)
  UNION ALL
  SELECT 'team_member_subject', b.id, b.organization_id
  FROM organizer_access.organization_team_members b
  WHERE NOT EXISTS (SELECT 1 FROM organizer_access.organization_members m
    WHERE m.organization_id = b.organization_id AND m.id = b.organization_member_id)
  UNION ALL
  SELECT 'team_event_team', b.id, b.organization_id
  FROM organizer_access.organization_team_events b
  WHERE NOT EXISTS (SELECT 1 FROM organizer_access.organization_teams t
    WHERE t.organization_id = b.organization_id AND t.id = b.team_id)
  UNION ALL
  SELECT 'team_event_resource', b.id, b.organization_id
  FROM organizer_access.organization_team_events b
  WHERE NOT EXISTS (SELECT 1 FROM events.events e
    WHERE e.organization_id = b.organization_id AND e.id = b.event_id)
  UNION ALL
  SELECT 'delegation_event_resource', d.id, d.client_organization_id
  FROM organizer_access.emc_client_delegations d
  WHERE d.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM events.events e
    WHERE e.organization_id = d.client_organization_id AND e.id = d.event_id)
)
SELECT issue, count(*) AS conflicting_rows,
       min(record_id::text) AS first_record_id,
       min(organization_id::text) AS first_organization_id
FROM conflicts GROUP BY issue ORDER BY issue;

COMMIT;
