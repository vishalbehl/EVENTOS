"""Shared structural preflight; real-role negative probes prove row behaviour."""
from sqlalchemy import text

SHARED_CATALOGUE_QUERY = text("""
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
           pg_has_role(current_user,c.relowner,'USAGE') AS inspecting_role_owns_table,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policy_count,
           EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid
               AND p.polname='category_a_shared_catalogue_scope' AND p.polcmd='*'
               AND p.polpermissive AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) AS scoped_policy,
           EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
               WHERE t.tgrelid=c.oid AND t.tgname='category_a_shared_catalogue_owner_guard'
                 AND t.tgenabled='O' AND NOT t.tgisinternal
                 AND f.oid=to_regprocedure('design.guard_shared_catalogue_owner_v1()')
                 AND NOT f.prosecdef AND 'search_path=pg_catalog'=ANY(f.proconfig)) AS owner_guard
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='design' AND c.relname IN ('form_templates','form_categories')
     ORDER BY c.relname
""")


def shared_catalogue_structure_is_safe(rows, *, require_non_owner=True):
    return (len(rows) == 2 and {row["relname"] for row in rows} == {"form_templates", "form_categories"}
        and all(row["relrowsecurity"] and row["relforcerowsecurity"] and row["policy_count"] == 1
            and row["scoped_policy"] and row["owner_guard"]
            and (not require_non_owner or not row["inspecting_role_owns_table"]) for row in rows))
