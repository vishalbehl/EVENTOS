-- Restricted migration-operator evidence after revision 3310. Never expose as
-- a customer API or run using runtime credentials with tenant filtering.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '60s';

SELECT count(*) AS total_bindings,
       count(*) FILTER (WHERE authorization_version = 0) AS unreviewed_bindings,
       count(*) FILTER (WHERE authorization_version = 1) AS reviewed_bindings,
       count(*) FILTER (WHERE authorization_version = 1 AND NOT
         organizer_access.category_a_team_permissions_valid_v1(permissions)) AS invalid_reviewed_bindings
FROM organizer_access.organization_team_events;

SELECT organization_id, authorization_version, count(*) AS bindings,
       count(*) FILTER (WHERE NOT organizer_access.category_a_team_permissions_valid_v1(permissions))
         AS invalid_permission_maps
FROM organizer_access.organization_team_events
GROUP BY organization_id, authorization_version
ORDER BY organization_id, authorization_version;

-- Legacy rows are ignored for authority even when their maps happen to be valid.
-- No blanket UPDATE to mark them reviewed is authorised by this report.
COMMIT;
