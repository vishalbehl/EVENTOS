"""Local-only snapshot backup/restore; never downgrade or overwrite a database.

Retains the newly restored database for later compatible-binary rehearsal.
The private temporary dump is removed only after verified restoration.
"""
from datetime import datetime, timezone
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.bootstrap_cloud_database import upsert_login

CONTAINER = "conf-platform-postgres-1"
SOURCE = "category_a_rehearsal_20261015"
EXPECTED_REVISION = "20261022_3670"
OWNER = uuid.UUID("0a62c7fc-5ee2-40fb-871c-2c74d59098cf")
FOREIGN = uuid.UUID("5a6ed530-6787-4985-87cc-92faf98345d3")
TABLE_QUERY = text("""SELECT n.nspname AS schema,c.relname AS name,
    (SELECT string_agg(quote_ident(a.attname),',' ORDER BY key.ordinality)
       FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY key(attnum,ordinality)
       JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum
      WHERE i.indrelid=c.oid AND i.indisprimary) AS ordering
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    ORDER BY n.nspname,c.relname""")
METADATA_QUERY = text("""SELECT kind,identity,definition FROM (
    SELECT 'constraint' AS kind,n.nspname||'.'||c.relname||'.'||k.conname AS identity,
      pg_get_constraintdef(k.oid)||'|validated='||k.convalidated::text AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'index',n.nspname||'.'||c.relname,
      pg_get_indexdef(c.oid)||'|valid='||i.indisvalid::text||'|ready='||i.indisready::text
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'table_security',n.nspname||'.'||c.relname,
      c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||pg_get_userbyid(c.relowner)||'|'||
      coalesce((SELECT string_agg(x.grantor::text||':'||x.grantee::text||':'||x.privilege_type||':'||x.is_grantable::text,
         ',' ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable)
         FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),'')
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'policy',n.nspname||'.'||c.relname||'.'||p.polname,
      p.polcmd::text||'|'||p.polpermissive::text||'|'||p.polroles::text||'|'||coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
      pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.prokind IN ('f','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,
      (row_number() OVER (PARTITION BY a.attrelid ORDER BY a.attnum))::text||'|'||
      a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||a.attidentity::text||'|'||
      a.attgenerated::text||'|'||a.attcollation::regcollation::text||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid),'')
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
        AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
      pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'view',n.nspname||'.'||c.relname,pg_get_viewdef(c.oid)||'|'||pg_get_userbyid(c.relowner)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('v','m') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    UNION ALL SELECT 'enum',n.nspname||'.'||t.typname||'.'||e.enumsortorder::text,e.enumlabel
      FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
    ) definitions ORDER BY kind,identity""")

_ITEM = r"'(?:[^']|'')*'::character varying"
_VARCHAR_ARRAY = re.compile(r"\(\(ARRAY\[(" + _ITEM + r"(?:, " + _ITEM + r")*)\]\)::text\[\]\)")
_ITEMS = re.compile(_ITEM)


def canonical_definition(value):
    """One known PG dump/parser spelling change, outside quoted SQL only.

    varchar literal-array -> text[] is the same element-wise text cast. Do not
    remove arbitrary casts, reorder predicates, or rewrite function bodies.
    Unrecognised definitions remain byte-for-byte strict.
    """
    output, offset = [], 0
    while offset < len(value):
        match = _VARCHAR_ARRAY.match(value, offset)
        if match:
            output.append("(ARRAY[" + ", ".join(f"({item})::text" for item in _ITEMS.findall(match[1])) + "])")
            offset = match.end()
            continue
        if value[offset] in {"'", '"'}:
            quote, end = value[offset], offset + 1
            escaped = quote == "'" and offset > 0 and value[offset - 1] in "Ee"
            while end < len(value):
                if escaped and value[end] == "\\":
                    end += 2
                elif value[end] == quote:
                    end += 1
                    if end < len(value) and value[end] == quote:
                        end += 1
                    else:
                        break
                else:
                    end += 1
            output.append(value[offset:end])
            offset = end
        else:
            output.append(value[offset])
            offset += 1
    return "".join(output)


def sequence_state(connection):
    rows = connection.execute(text("""SELECT n.nspname,c.relname FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S'
        AND n.nspname NOT LIKE 'pg_%' ORDER BY n.nspname,c.relname""")).all()
    quote = connection.dialect.identifier_preparer.quote
    return {f"{schema}.{name}": dict(connection.execute(text(
        f"SELECT last_value,is_called FROM {quote(schema)}.{quote(name)}")).mappings().one())
        for schema, name in rows}


def quarantine_database(engine, name):
    if not re.fullmatch(r"category_a_restore_\d{8}_[0-9a-f]{12}", name):
        raise RuntimeError("Only an isolated restore target may be quarantined")
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        if connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name"), {"name": name}):
            raise RuntimeError("Restore target has live sessions; do not terminate them implicitly")
        quoted = connection.dialect.identifier_preparer.quote(name)
        connection.execute(text(f"ALTER DATABASE {quoted} ALLOW_CONNECTIONS false"))
        assert connection.scalar(text("SELECT datallowconn FROM pg_database WHERE datname=:name"), {"name": name}) is False


def docker(*arguments, timeout=300):
    result = subprocess.run(["docker", "exec", CONTAINER, *arguments], capture_output=True,
        text=True, timeout=timeout, check=False)
    if result.returncode:
        # Provider/process output may include SQL bodies; never print it blindly.
        raise RuntimeError("Container database command failed")
    return result.stdout.strip()


def fingerprint(connection):
    connection.execute(text("SET LOCAL TIME ZONE 'UTC'"))
    connection.execute(text("SET LOCAL search_path=pg_catalog"))
    tables = connection.execute(TABLE_QUERY).mappings().all()
    if len(tables) > 1000:
        raise RuntimeError("Local rehearsal table budget exceeded")
    quote = connection.dialect.identifier_preparer.quote
    report = {}
    for table in tables:
        qualified = f"{quote(table['schema'])}.{quote(table['name'])}"
        count = connection.scalar(text(f"SELECT count(*) FROM {qualified}"))
        if count > 100000 or (not table["ordering"] and count > 1000):
            raise RuntimeError("Local rehearsal row/order budget exceeded")
        order = table["ordering"] or "to_jsonb(t)::text"
        digest = hashlib.sha256()
        actual = 0
        result = connection.execution_options(stream_results=True, yield_per=100).execute(
            text(f"SELECT to_jsonb(t)::text FROM {qualified} t ORDER BY {order}"))
        try:
            for value in result.scalars():
                encoded = value.encode("utf-8")
                digest.update(len(encoded).to_bytes(8, "big"))
                digest.update(encoded)
                actual += 1
        finally:
            result.close()
            connection.execution_options(stream_results=False)
        assert actual == count
        report[f"{table['schema']}.{table['name']}"] = {"rows": count, "sha256": digest.hexdigest()}
    definitions = [dict(row) for row in connection.execute(METADATA_QUERY).mappings()]
    for definition in definitions:
        if definition["kind"] in {"constraint", "index", "column", "trigger", "view"}:
            definition["definition"] = canonical_definition(definition["definition"])
    metadata_hash = hashlib.sha256(json.dumps(definitions, sort_keys=True).encode()).hexdigest()
    return {"tables": report, "schema_security_sha256": metadata_hash, "sequences": sequence_state(connection),
        "migration_revision": connection.scalar(text("SELECT version_num FROM public.alembic_version"))}


def main():
    run_id = uuid.uuid4().hex
    restored_name = f"category_a_restore_{datetime.now(timezone.utc):%Y%m%d}_{run_id[:12]}"
    dump_path = f"/tmp/category_a_restore_{run_id}.dump"
    if not re.fullmatch(r"category_a_restore_\d{8}_[0-9a-f]{12}", restored_name):
        raise RuntimeError("Invalid isolated restore target")
    if not re.fullmatch(r"/tmp/category_a_restore_[0-9a-f]{32}\.dump", dump_path):
        raise RuntimeError("Invalid private backup target")
    source_url = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    if settings.is_production or source_url.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the named local rehearsal database is permitted")
    engine = create_engine(source_url)
    restore_engine = None
    created_database = False
    stage = "source_preflight"
    result = {"status": "FAILED", "environment": "local_isolated_rehearsal", "run_id": run_id,
        "source_database": SOURCE, "restored_database": restored_name,
        "started_at": datetime.now(timezone.utc).isoformat()}
    try:
        with engine.connect() as connection:
            operator = connection.scalar(text("SELECT current_user"))
            assert re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", operator)
            assert connection.scalar(text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user"))
            assert connection.scalar(text("SELECT pg_database_size(current_database())")) <= 256 * 1024 * 1024
            system_id = str(connection.scalar(text("SELECT system_identifier FROM pg_control_system()")))
            assert docker("psql", "-U", operator, "-d", SOURCE, "-At", "-c",
                "SELECT system_identifier FROM pg_control_system()") == system_id
        stage = "snapshot_backup"
        with engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection:
            with connection.begin():
                connection.execute(text("SET TRANSACTION READ ONLY"))
                snapshot = connection.scalar(text("SELECT pg_export_snapshot()"))
                source_state = fingerprint(connection)
                assert source_state["migration_revision"] == EXPECTED_REVISION
                # Positional arguments, not interpolated shell commands. Private
                # umask applies before the dump file is first created.
                docker("sh", "-c", 'umask 077; exec "$@"', "backup", "pg_dump", "-U", operator,
                    "-d", SOURCE, "--format=custom", f"--snapshot={snapshot}", f"--file={dump_path}")
                assert sequence_state(connection) == source_state["sequences"], "Sequences changed during backup"
        result["backup_sha256"] = docker("sha256sum", "--", dump_path).split()[0]
        assert docker("stat", "-c", "%a", dump_path) == "600"
        stage = "isolated_restore"
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            assert connection.scalar(text("SELECT count(*) FROM pg_database WHERE datname=:name"), {"name": restored_name}) == 0
            quoted = connection.dialect.identifier_preparer.quote(restored_name)
            connection.execute(text(f"CREATE DATABASE {quoted}"))
            created_database = True
        docker("pg_restore", "-U", operator, "-d", restored_name, "--exit-on-error", dump_path)
        restore_url = source_url.set(database=restored_name)
        restore_engine = create_engine(restore_url)
        stage = "data_schema_comparison"
        with restore_engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection, connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            restored_state = fingerprint(connection)
        assert restored_state == source_state, "Restored data/schema/security differs from exported snapshot"
        result.update(source_state)
        stage = "restricted_runtime_acceptance"
        login, password = "category_a_rehearsal_runtime_20261015", secrets.token_urlsafe(40)
        with engine.connect() as connection:
            if connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:login"), {"login": login}):
                raise RuntimeError("Drain existing rehearsal runtime sessions before credential rotation")
        raw = engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, login, password, "event_runtime")
            raw.commit()
        finally:
            raw.close()
        from app.core.database_security import enforce_runtime_database_login
        runtime_url = restore_url.set(username=login, password=password)
        security = enforce_runtime_database_login(runtime_url)
        result["runtime_security"] = asdict(security)
        runtime = create_engine(runtime_url)
        try:
            with runtime.connect() as connection:
                privileges = connection.execute(text("SELECT rolcreatedb,rolreplication FROM pg_roles WHERE rolname=current_user")).one()
                assert not privileges.rolcreatedb and not privileges.rolreplication
                assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces")) == 0
                connection.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(OWNER)})
                assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces WHERE organization_id=:owner"), {"owner": OWNER}) >= 1
                assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces WHERE organization_id=:other"), {"other": FOREIGN}) == 0
                connection.rollback()
                assert connection.scalar(text("SELECT coalesce(current_setting('app.current_organization_id',true),'')")) == ""
                assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces")) == 0
        finally:
            runtime.dispose()
        stage = "private_backup_cleanup"
        docker("rm", "--", dump_path)
        result.update(status="PASSED", completed_at=datetime.now(timezone.utc).isoformat(),
            private_dump_removed=True, restored_database_retained=True,
            runtime_context_isolation_verified=True, application_binary_rollback="NOT_RUN",
            staging_or_production_acceptance="NOT_RUN")
    except Exception as error:
        result.update(failed_stage=stage, error_type=type(error).__name__,
            private_dump_may_be_retained=dump_path, restored_database_may_exist=True)
    finally:
        if restore_engine is not None:
            restore_engine.dispose()
        if created_database:
            try:
                quarantine_database(engine, restored_name)
                result["restored_database_quarantined"] = True
            except Exception as error:
                result.update(status="FAILED", failed_stage="restore_quarantine", error_type=type(error).__name__)
        engine.dispose()
    result["probe_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    output = Path(__file__).parents[1] / f"test-results/category-a-backup-restore-{run_id}.json"
    with output.open("x", encoding="utf-8") as artifact:
        json.dump(result, artifact, indent=2)
    print(json.dumps({key: value for key, value in result.items() if key != "tables"}, indent=2))
    print(f"Evidence: {output.name}")
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
