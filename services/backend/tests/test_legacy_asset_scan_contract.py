from __future__ import annotations

import inspect


def test_legacy_asset_upload_uses_registered_shared_scan_task():
    from app.modules.files.services.file_service import FileService
    from app.modules.files.routers.files import upload_file
    from app.modules.platform.application.support_commands import SupportTicketCommandService
    from app.tasks.upload_jobs import scan_asset_for_viruses

    file_source = inspect.getsource(FileService.upload_asset)
    adapter_source = inspect.getsource(upload_file)
    support_source = inspect.getsource(SupportTicketCommandService.complete_attachment)

    assert "from workers" not in file_source
    assert "from workers" not in support_source
    # Service writes the durable pending scan; only the committing adapter may
    # publish it. Reintroducing pre-commit dispatch must fail this contract.
    assert "scan_asset_for_viruses.delay" not in file_source
    assert "VirusScan(" in file_source and 'status="pending"' in file_source
    assert adapter_source.index("await db.commit()") < adapter_source.index("scan_asset_for_viruses.delay")
    assert "scan_asset_for_viruses.delay" in support_source
    assert support_source.index("await self.db.commit()") < support_source.index("scan_asset_for_viruses.delay")
    assert scan_asset_for_viruses.name == "app.tasks.scan_asset_for_viruses"
    assert scan_asset_for_viruses.queue == "files"


def test_legacy_asset_scan_is_tenant_scoped_and_terminally_safe():
    from app.tasks.upload_jobs import _mark_asset_scan_failed, _scan_asset, scan_asset_for_viruses

    assert "Asset.organization_id == organization_id" in inspect.getsource(_scan_asset)
    assert "Asset.organization_id == organization_id" in inspect.getsource(_mark_asset_scan_failed)
    assert "processing_status == \"READY\"" in inspect.getsource(_scan_asset)
    assert scan_asset_for_viruses.acks_late is True
