"""Phase 3A command-level regression contracts."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_campaign_commands_have_durable_idempotency_and_version_contracts():
    router = _read("app/modules/notifications/routers/notifications.py")
    service = _read("app/modules/events/services/event_campaign_mutation_service.py")

    assert router.count('operation="email_campaign.') >= 5
    assert "with_for_update()" in router
    assert "RESOURCE_VERSION_CONFLICT" in service
    assert "row.version += 1" in service
    assert "complete_idempotent" in router


def test_campaign_worker_claims_under_lock_and_advances_version():
    worker = _read("app/modules/notifications/tasks/email_tasks.py")
    assert ".with_for_update()" in worker
    assert 'campaign.status in {"draft", "scheduled", "failed"}' in worker
    assert "campaign.version += 1" in worker
    assert "recover_email_campaign_dispatches" in worker
    assert "updated_at < cutoff" in worker


def test_upload_status_exposes_version_and_completion_fingerprints_version():
    status_service = _read("app/core/job_status_service.py")
    repository = _read("app/modules/files/infrastructure/repositories.py")
    router = _read("app/modules/files/routers/files.py")
    assert "version=row.version" in status_service
    assert "DurableUpload.version" in repository
    assert '"version": if_match' in router


def test_forward_migration_restores_older_writer_defaults():
    migration = _read("alembic/versions/20260909_0800_version_server_defaults.py")
    assert 'down_revision = "20260909_0700"' in migration
    assert 'schema="content"' in migration
    assert 'schema="communications"' in migration
    assert 'server_default="1"' in migration


def test_registration_form_mutations_lock_authoritative_rows_and_fingerprint_versions():
    commands = _read("app/modules/registration/application/commands.py")
    update_start = commands.index("async def update(db: AsyncSession, *, template_id:")
    delete_start = commands.index("async def delete(db: AsyncSession, *, template_id:")
    update_block = commands[update_start:delete_start]
    delete_block = commands[delete_start:commands.index("class RegistrationFormCommandService")]

    assert ".with_for_update()" in update_block
    assert '"if_match": if_match' in update_block
    assert ".with_for_update()" in delete_block
    assert '"if_match": if_match' in delete_block

    form_block = commands[commands.index("class RegistrationFormCommandService"):]
    assert ".with_for_update()" in form_block
    assert 'operation="registration.form.update"' in form_block
