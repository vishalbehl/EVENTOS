"""Provision least-privilege cloud database logins and connection secrets.

Run only as the dedicated ECS database-bootstrap task. The RDS-managed master
secret is read through the task role; passwords are injected from the separate
deployment secret and never printed.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import quote_plus

import boto3
import psycopg2
from psycopg2 import sql


RUNTIME_LOGIN = "event_runtime_login"
MIGRATION_LOGIN = "event_migration_login"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is missing")
    return value


def read_json_secret(client, secret_id: str) -> dict[str, str]:
    response = client.get_secret_value(SecretId=secret_id)
    return json.loads(response["SecretString"])


def upsert_login(cursor, login: str, password: str, group: str) -> None:
    # Existing memberships/ownership are not repaired by stripping direct role
    # flags. A login can still SET ROLE to an owner or privileged ancestor.
    if group == "event_runtime":
        if role_exists(cursor, login):
            cursor.execute("""SELECT r.rolname FROM pg_roles r WHERE
                (r.rolname=%s OR pg_has_role(%s,r.oid,'MEMBER'))
                AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)""", (login, login))
            if cursor.fetchone():
                raise RuntimeError("Existing runtime identity has privileged role ancestry; approved remediation is required.")
            cursor.execute("""SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname NOT IN ('pg_catalog','information_schema')
                AND n.nspname NOT LIKE 'pg_toast%%' AND pg_has_role(%s,c.relowner,'MEMBER') LIMIT 1""", (login,))
            if cursor.fetchone():
                raise RuntimeError("Existing runtime identity can assume an object owner; approved remediation is required.")
    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (login,))
    if cursor.fetchone() is None:
        cursor.execute(
            sql.SQL("CREATE ROLE {} LOGIN PASSWORD {} INHERIT").format(
                sql.Identifier(login),
                sql.Literal(password),
            )
        )
    else:
        cursor.execute(
            sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                sql.Identifier(login),
                sql.Literal(password),
            )
        )

    cursor.execute(
        sql.SQL(
            "ALTER ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT {} NOREPLICATION"
        ).format(sql.Identifier(login), sql.SQL("BYPASSRLS" if group == "event_migration" else "NOBYPASSRLS"))
    )


    cursor.execute(
        sql.SQL("GRANT {} TO {}").format(
            sql.Identifier(group),
            sql.Identifier(login),
        )
    )


def role_exists(cursor, login):
    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (login,))
    return cursor.fetchone() is not None


def merge_secret(client, secret_id: str, values: dict[str, str]) -> None:
    try:
        current = read_json_secret(client, secret_id)
    except client.exceptions.ResourceNotFoundException:
        current = {}
    current.update(values)
    client.put_secret_value(SecretId=secret_id, SecretString=json.dumps(current))


def database_url(driver: str, user: str, password: str, host: str, port: str, name: str) -> str:
    return (
        f"postgresql+{driver}://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{name}?sslmode=require"
    )


def main() -> None:
    environment = required("DEPLOYMENT_PROFILE")
    if environment not in {"staging", "production"} or required("DATABASE_CLUSTER_ISOLATED") != "true":
        raise RuntimeError("Cloud bootstrap requires an explicit staging/production profile and isolated deployment cluster.")
    runtime_login = f"event_{environment}_runtime_login"
    migration_login = f"event_{environment}_migration_login"
    region = required("AWS_REGION")
    secrets = boto3.client("secretsmanager", region_name=region)
    admin = read_json_secret(secrets, required("DATABASE_ADMIN_SECRET_ARN"))

    host = required("DATABASE_HOST")
    port = required("DATABASE_PORT")
    name = required("DATABASE_NAME")
    runtime_password = required("RUNTIME_DB_PASSWORD")
    migration_password = required("MIGRATION_DB_PASSWORD")
    if min(len(runtime_password), len(migration_password)) < 24 or runtime_password == migration_password:
        raise RuntimeError("Independent runtime/migration passwords of at least 24 characters are required.")

    connection = psycopg2.connect(
        host=host,
        port=port,
        dbname=name,
        user=admin["username"],
        password=admin["password"],
        sslmode="require",
    )
    try:
        with connection.cursor() as cursor:
            role_sql = Path(__file__).with_name("sql").joinpath(
                "provision_database_role_groups.sql"
            ).read_text(encoding="utf-8")
            cursor.execute(role_sql)
            upsert_login(cursor, runtime_login, runtime_password, "event_runtime")
            upsert_login(cursor, migration_login, migration_password, "event_migration")

            cursor.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}, {}").format(
                    sql.Identifier(name),
                    sql.Identifier(runtime_login),
                    sql.Identifier(migration_login),
                )
            )
            cursor.execute(
                sql.SQL("GRANT CREATE, TEMPORARY ON DATABASE {} TO {}").format(
                    sql.Identifier(name),
                    sql.Identifier(migration_login),
                )
            )
            cursor.execute(
                sql.SQL("GRANT ALL ON SCHEMA public TO {}").format(
                    sql.Identifier(migration_login)
                )
            )
        connection.commit()
    finally:
        connection.close()

    runtime_sync = database_url(
        "psycopg2", runtime_login, runtime_password, host, port, name
    )
    runtime_async = database_url(
        "asyncpg", runtime_login, runtime_password, host, port, name
    ).replace("?sslmode=require", "?ssl=require")
    migration_sync = database_url(
        "psycopg2", migration_login, migration_password, host, port, name
    )
    migration_async = database_url(
        "asyncpg", migration_login, migration_password, host, port, name
    ).replace("?sslmode=require", "?ssl=require")

    merge_secret(
        secrets,
        required("RUNTIME_SECRET_ARN"),
        {
            "DATABASE_URL_SYNC": runtime_sync,
            "DATABASE_URL_ASYNC": runtime_async,
        },
    )
    merge_secret(
        secrets,
        required("DEPLOYMENT_SECRET_ARN"),
        {
            "DATABASE_URL_SYNC": migration_sync,
            "DATABASE_URL_ASYNC": migration_async,
        },
    )
    print("Cloud database roles and connection secrets are ready.")


if __name__ == "__main__":
    main()
