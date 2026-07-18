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


RUNTIME_LOGIN = "eventx_runtime_login"
MIGRATION_LOGIN = "eventx_migration_login"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is missing")
    return value


def read_json_secret(client, secret_id: str) -> dict[str, str]:
    response = client.get_secret_value(SecretId=secret_id)
    return json.loads(response["SecretString"])


def upsert_login(cursor, login: str, password: str, group: str) -> None:
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
            "ALTER ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS"
        ).format(sql.Identifier(login))
    )
    cursor.execute(
        sql.SQL("GRANT {} TO {}").format(
            sql.Identifier(group),
            sql.Identifier(login),
        )
    )


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
    region = required("AWS_REGION")
    secrets = boto3.client("secretsmanager", region_name=region)
    admin = read_json_secret(secrets, required("DATABASE_ADMIN_SECRET_ARN"))

    host = required("DATABASE_HOST")
    port = required("DATABASE_PORT")
    name = required("DATABASE_NAME")
    runtime_password = required("RUNTIME_DB_PASSWORD")
    migration_password = required("MIGRATION_DB_PASSWORD")

    connection = psycopg2.connect(
        host=host,
        port=port,
        dbname=name,
        user=admin["username"],
        password=admin["password"],
        sslmode="require",
    )
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            role_sql = Path(__file__).with_name("sql").joinpath(
                "provision_database_role_groups.sql"
            ).read_text(encoding="utf-8")
            cursor.execute(role_sql)
            upsert_login(cursor, RUNTIME_LOGIN, runtime_password, "eventx_runtime")
            upsert_login(cursor, MIGRATION_LOGIN, migration_password, "eventx_migration")

            cursor.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}, {}").format(
                    sql.Identifier(name),
                    sql.Identifier(RUNTIME_LOGIN),
                    sql.Identifier(MIGRATION_LOGIN),
                )
            )
            cursor.execute(
                sql.SQL("GRANT CREATE, TEMPORARY ON DATABASE {} TO {}").format(
                    sql.Identifier(name),
                    sql.Identifier(MIGRATION_LOGIN),
                )
            )
            cursor.execute(
                sql.SQL("GRANT ALL ON SCHEMA public TO {}").format(
                    sql.Identifier(MIGRATION_LOGIN)
                )
            )
    finally:
        connection.close()

    runtime_sync = database_url(
        "psycopg2", RUNTIME_LOGIN, runtime_password, host, port, name
    )
    runtime_async = database_url(
        "asyncpg", RUNTIME_LOGIN, runtime_password, host, port, name
    ).replace("?sslmode=require", "?ssl=require")
    migration_sync = database_url(
        "psycopg2", MIGRATION_LOGIN, migration_password, host, port, name
    )
    migration_async = database_url(
        "asyncpg", MIGRATION_LOGIN, migration_password, host, port, name
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
