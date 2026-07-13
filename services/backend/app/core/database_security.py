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

    @property
    def runtime_role_is_safe(self) -> bool:
        return not self.is_superuser and not self.bypasses_rls


async def inspect_database_security(session: AsyncSession) -> DatabaseSecurityReport:
    role = (
        await session.execute(
            text(
                "SELECT rolname, rolsuper, rolbypassrls "
                "FROM pg_roles WHERE rolname = current_user"
            )
        )
    ).mappings().one()
    missing: list[str] = []
    for tenant_table in ALL_TENANT_TABLES:
        exists = await session.scalar(
            text(
                "SELECT EXISTS ("
                "SELECT 1 FROM pg_policies "
                "WHERE schemaname = :schema_name "
                "AND tablename = :table_name "
                "AND policyname = :policy_name)"
            ),
            {
                "schema_name": tenant_table.schema,
                "table_name": tenant_table.table,
                "policy_name": tenant_table.policy_name,
            },
        )
        if not exists:
            missing.append(tenant_table.fullname)
    return DatabaseSecurityReport(
        role_name=role["rolname"],
        is_superuser=bool(role["rolsuper"]),
        bypasses_rls=bool(role["rolbypassrls"]),
        missing_canary_policies=tuple(missing),
    )


async def enforce_runtime_database_security(session: AsyncSession) -> DatabaseSecurityReport:
    report = await inspect_database_security(session)
    failures: list[str] = []
    if not report.runtime_role_is_safe:
        failures.append(
            f"database role {report.role_name!r} is superuser or has BYPASSRLS"
        )
    if report.missing_canary_policies:
        failures.append(
            "missing tenant policies: " + ", ".join(report.missing_canary_policies)
        )
    if failures:
        raise RuntimeError("Unsafe runtime database security: " + "; ".join(failures))
    return report
