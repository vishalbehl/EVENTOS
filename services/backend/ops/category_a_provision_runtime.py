"""Explicit environment-scoped runtime provisioning; never invoked by app startup.

Authored only. Run after operator approval and migration rehearsal, not while
implementation testing is deferred. DB_BOOTSTRAP_URL and RUNTIME_DB_PASSWORD are
injected by the selected environment's secret manager; output contains no secrets.
"""
import argparse
import json
import os
from pathlib import Path

import psycopg2
from psycopg2 import sql
from sqlalchemy.engine import make_url

from bootstrap_cloud_database import upsert_login


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", required=True, choices=("local", "staging", "production"))
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--isolated-deployment-cluster", action="store_true")
    args = parser.parse_args()
    if not 12 <= len(args.approval_reference.strip()) <= 200:
        parser.error("Approval reference must be 12-200 characters")
    if args.environment != "local" and not args.isolated_deployment_cluster:
        parser.error("Staging/production role groups require separate deployment clusters; shared-cluster grants are not supported")
    url = make_url(os.environ.get("DB_BOOTSTRAP_URL", ""))
    if url.get_backend_name() != "postgresql" or url.database != args.expected_database:
        parser.error("Bootstrap connection does not match the selected PostgreSQL database")
    password = os.environ.get("RUNTIME_DB_PASSWORD", "")
    if len(password) < 24:
        parser.error("A dedicated runtime password of at least 24 characters is required")
    login = "event_runtime_login" if args.environment == "local" else f"event_{args.environment}_runtime_login"
    options = dict(url.query)
    if args.environment != "local" and options.get("sslmode") not in {"verify-full", "verify-ca", "require"}:
        parser.error("Staging/production bootstrap connections require TLS")
    connection = psycopg2.connect(host=url.host, port=url.port or 5432, dbname=url.database,
        user=url.username, password=url.password, connect_timeout=10, **options)
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT current_database(), current_user")
                database, operator = cursor.fetchone()
                if database != args.expected_database or operator == login:
                    raise RuntimeError("Bootstrap identity/database is invalid")
                cursor.execute("SET LOCAL lock_timeout='5s'")
                cursor.execute("SET LOCAL statement_timeout='60s'")
                cursor.execute(Path(__file__).with_name("sql").joinpath("provision_database_role_groups.sql").read_text(encoding="utf-8"))
                upsert_login(cursor, login, password, "event_runtime")
                cursor.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(sql.Identifier(database), sql.Identifier(login)))
        print(json.dumps({"environment": args.environment, "database": args.expected_database,
            "runtime_login": login, "approval_reference": args.approval_reference,
            "status": "ROLE_PROVISIONED_NOT_ACCEPTANCE_VERIFIED", "runtime_privilege_verification": "NOT_RUN"}))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
