from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenancy_registry import ALL_TENANT_TABLES


@dataclass(frozen=True)
class DatabaseSecurityReport:
    role_name: str
    is_superuser: bool
    bypasses_rls: bool
    missing_canary_policies: tuple[str, ...]
    owns_application_objects: bool = False
    can_assume_privileged_role: bool = False
    can_create_roles: bool = False

    @property
    def runtime_role_is_safe(self) -> bool:
        return not (self.is_superuser or self.bypasses_rls or self.owns_application_objects
                    or self.can_assume_privileged_role or self.can_create_roles)


_ROLE_QUERY = text("""SELECT r.rolname,r.rolsuper,r.rolbypassrls,r.rolcreaterole,
    EXISTS (SELECT 1 FROM pg_roles dangerous WHERE dangerous.oid<>r.oid
      AND (dangerous.rolsuper OR dangerous.rolbypassrls OR dangerous.rolcreaterole)
      AND pg_has_role(current_user,dangerous.oid,'MEMBER')) AS assumes_privileged,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND c.relkind IN ('r','p','v','m','f') AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_objects
    FROM pg_roles r WHERE r.rolname=current_user""")

_POLICY_QUERY = text("""SELECT n.nspname||'.'||c.relname AS fullname,
    c.relrowsecurity, COALESCE(array_agg(p.polname) FILTER (WHERE p.oid IS NOT NULL), ARRAY[]::name[]) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid=c.oid
    WHERE n.nspname=ANY(:schemas) AND c.relkind IN ('r','p')
    GROUP BY n.nspname,c.relname,c.relrowsecurity""")


def _report(role, tables):
    by_name = {row["fullname"]: row for row in tables}
    missing = tuple(table.fullname for table in ALL_TENANT_TABLES
        if table.fullname not in by_name or not by_name[table.fullname]["relrowsecurity"]
        or table.policy_name not in by_name[table.fullname]["policies"])
    return DatabaseSecurityReport(role_name=role["rolname"], is_superuser=bool(role["rolsuper"]),
        bypasses_rls=bool(role["rolbypassrls"]), missing_canary_policies=missing,
        owns_application_objects=bool(role["owns_objects"]),
        can_assume_privileged_role=bool(role["assumes_privileged"]), can_create_roles=bool(role["rolcreaterole"]))


async def inspect_database_security(session: AsyncSession) -> DatabaseSecurityReport:
    role = (await session.execute(_ROLE_QUERY)).mappings().one()
    tables = (await session.execute(_POLICY_QUERY,
        {"schemas": sorted({table.schema for table in ALL_TENANT_TABLES})})).mappings().all()
    return _report(role, tables)


def enforce_runtime_database_security_sync(connection):
    role = connection.execute(_ROLE_QUERY).mappings().one()
    tables = connection.execute(_POLICY_QUERY,
        {"schemas": sorted({table.schema for table in ALL_TENANT_TABLES})}).mappings().all()
    return _enforce(_report(role, tables))


def enforce_runtime_database_login(url):
    """Use an independent, unpooled startup connection, safe before worker fork."""
    from sqlalchemy import create_engine
    from sqlalchemy.pool import NullPool
    guard_engine = create_engine(url, poolclass=NullPool, connect_args={"connect_timeout": 10})
    try:
        with guard_engine.connect() as connection:
            return enforce_runtime_database_security_sync(connection)
    finally:
        guard_engine.dispose()


async def enforce_runtime_database_security(session: AsyncSession) -> DatabaseSecurityReport:
    report = await inspect_database_security(session)
    return _enforce(report)


def _enforce(report):
    failures: list[str] = []
    if not report.runtime_role_is_safe:
        failures.append(
            f"database role {report.role_name!r} has unsafe ownership, role membership or administrative privileges"
        )
    if report.missing_canary_policies:
        failures.append(
            "missing tenant policies: " + ", ".join(report.missing_canary_policies)
        )
    if failures:
        raise RuntimeError("Unsafe runtime database security: " + "; ".join(failures))
    return report
