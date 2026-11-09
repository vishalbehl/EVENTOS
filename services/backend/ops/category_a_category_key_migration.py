"""Data/metadata proofs for the additive key expansion on isolated clones."""
import subprocess
import sys

from sqlalchemy import text

from ops.category_a_backup_restore_rehearsal import fingerprint, METADATA_QUERY, canonical_definition

VERSION = "20261021_3660"
PREVIOUS = "20261021_3650"
COLUMN = ("column", "design.form_templates.category_key")


def snapshot(engine):
    with engine.begin() as connection:
        result = fingerprint(connection)
        definitions = {(row.kind, row.identity): canonical_definition(row.definition)
            for row in connection.execute(METADATA_QUERY).all()}
        node = connection.scalar(text("SELECT relfilenode FROM pg_class WHERE oid='design.form_templates'::regclass"))
    return dict(data=result, definitions=definitions, node=node)


def assert_preserved(before, after, *, from_length, to_length, revision, metadata_only=False):
    original = {key: value for key, value in before["data"]["tables"].items() if key != "public.alembic_version"}
    current = {key: value for key, value in after["data"]["tables"].items() if key != "public.alembic_version"}
    assert original == current and before["data"]["sequences"] == after["data"]["sequences"]
    assert after["data"]["migration_revision"] == revision
    definitions = dict(before["definitions"])
    source = f"|character varying({from_length})|"
    target = f"|character varying({to_length})|"
    assert definitions[COLUMN].count(source) == 1
    definitions[COLUMN] = definitions[COLUMN].replace(source, target, 1)
    assert after["definitions"] == definitions
    if metadata_only:
        assert before["node"] == after["node"]
    return dict(retained_tables=len(original), retained_rows=sum(row["rows"] for row in original.values()),
        rows_and_sequences_unchanged=True, security_indexes_and_other_columns_unchanged=True,
        only_column_limit_changed=True, metadata_only_table_expansion=metadata_only)


def migrate(root, environment, action, revision):
    return subprocess.run([sys.executable, "-m", "alembic", action, revision],
        cwd=root, env=environment, capture_output=True, text=True, timeout=180)


def rehearse_short_rollback(engine, root, environment):
    # Only the caller's newly-created backup clone may reach this helper.
    before = snapshot(engine)
    assert before["data"]["migration_revision"] == VERSION
    with engine.begin() as connection:
        assert not connection.scalar(text("SELECT EXISTS(SELECT 1 FROM design.form_templates WHERE char_length(category_key)>50)"))
    command = migrate(root, environment, "downgrade", PREVIOUS)
    assert command.returncode == 0
    narrowed = snapshot(engine)
    assert_preserved(before, narrowed, from_length=100, to_length=50, revision=PREVIOUS)
    command = migrate(root, environment, "upgrade", VERSION)
    assert command.returncode == 0
    expanded = snapshot(engine)
    preservation = assert_preserved(narrowed, expanded, from_length=50, to_length=100,
        revision=VERSION, metadata_only=True)
    return dict(short_key_downgrade_preserved_data=True, re_expansion=preservation)


def rehearse_long_rollback_refusal(engine, root, environment):
    before = snapshot(engine)
    assert before["data"]["migration_revision"] == VERSION
    with engine.begin() as connection:
        assert connection.scalar(text("SELECT EXISTS(SELECT 1 FROM design.form_templates WHERE char_length(category_key)>50)"))
    command = migrate(root, environment, "downgrade", PREVIOUS)
    assert command.returncode != 0 and "Category keys exceed the old limit" in command.stderr
    after = snapshot(engine)
    assert before == after
    return dict(long_key_downgrade_refused=True, all_data_metadata_revision_and_sequences_unchanged=True)
