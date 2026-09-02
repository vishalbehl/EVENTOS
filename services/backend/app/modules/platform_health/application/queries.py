"""Read-only diagnostic query services."""

from __future__ import annotations

import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def sanitize_query(query: str | None) -> str:
    value = re.sub(r"'(?:''|[^'])*'", "'?'", query or "")
    value = re.sub(r"\b\d+(?:\.\d+)?\b", "?", value)
    return value[:200]


class PlatformHealthQueryService:
    """Own bounded database diagnostics without writes or commits."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def database_stats(self) -> dict:
        """Return bounded PostgreSQL diagnostics without application-side state."""
        conn_rows = (
            await self.db.execute(
                text(
                    "SELECT state, count(*) FROM pg_stat_activity "
                    "WHERE datname = current_database() GROUP BY state"
                )
            )
        ).all()
        connections = {row[0]: int(row[1]) for row in conn_rows}
        active = connections.get("active", 0)
        idle = connections.get("idle", 0)
        waiting = connections.get("idle in transaction", 0)
        max_connections = int(
            (await self.db.execute(text("SHOW max_connections"))).scalar() or 100
        )
        cache_hit_ratio = float(
            (
                await self.db.execute(
                    text(
                        "SELECT sum(heap_blks_hit)::float / "
                        "NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 "
                        "FROM pg_statio_user_tables"
                    )
                )
            ).scalar()
            or 99.9
        )
        database_size_bytes = int(
            (
                await self.db.execute(
                    text("SELECT pg_database_size(current_database())")
                )
            ).scalar()
            or 0
        )
        dead_tuples = int(
            (
                await self.db.execute(
                    text("SELECT coalesce(sum(n_dead_tup), 0) FROM pg_stat_user_tables")
                )
            ).scalar()
            or 0
        )
        pg_stat_statements_available = bool(
            (
                await self.db.execute(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM pg_extension "
                        "WHERE extname = 'pg_stat_statements')"
                    )
                )
            ).scalar()
        )
        table_rows = (
            await self.db.execute(
                text(
                    "SELECT schemaname || '.' || tablename, "
                    "pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)), "
                    "pg_total_relation_size(schemaname||'.'||tablename) "
                    "FROM pg_tables WHERE schemaname NOT IN "
                    "('pg_catalog','information_schema') "
                    "ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10"
                )
            )
        ).all()
        return {
            "connections": {
                "active": active,
                "idle": idle,
                "waiting": waiting,
                "total": active + idle + waiting,
                "max": max_connections,
            },
            "cache_hit_ratio": round(cache_hit_ratio, 2),
            "database_size_bytes": database_size_bytes,
            "dead_tuples": dead_tuples,
            "pg_stat_statements_available": pg_stat_statements_available,
            "table_sizes": [
                {"name": row[0], "size": row[1], "size_bytes": row[2]}
                for row in table_rows
            ],
        }

    async def slow_queries(self, *, limit: int = 10) -> list[dict]:
        bounded_limit = min(max(int(limit), 1), 100)
        try:
            rows = (
                await self.db.execute(
                    text(
                        """
                        SELECT query, round(mean_exec_time::numeric, 2), calls,
                               round(total_exec_time::numeric, 2)
                        FROM pg_stat_statements
                        WHERE query NOT LIKE '%pg_stat%'
                        ORDER BY mean_exec_time DESC
                        LIMIT :limit
                        """
                    ),
                    {"limit": bounded_limit},
                )
            ).all()
            return [
                {
                    "query": sanitize_query(row[0]),
                    "avg_ms": float(row[1]),
                    "calls": int(row[2]),
                    "total_ms": float(row[3]),
                }
                for row in rows
            ]
        except Exception:
            rows = (
                await self.db.execute(
                    text(
                        """
                        SELECT query,
                               extract(epoch from (now() - query_start)) * 1000
                        FROM pg_stat_activity
                        WHERE state != 'idle'
                          AND query NOT LIKE '%pg_stat%'
                          AND query_start IS NOT NULL
                        ORDER BY 2 DESC
                        LIMIT :limit
                        """
                    ),
                    {"limit": bounded_limit},
                )
            ).all()
            return [
                {
                    "query": sanitize_query(row[0]),
                    "avg_ms": round(float(row[1] or 0), 2),
                    "calls": 1,
                    "total_ms": round(float(row[1] or 0), 2),
                }
                for row in rows
            ]
