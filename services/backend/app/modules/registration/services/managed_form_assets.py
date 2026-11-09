"""Tenant-owned, clean managed assets used by validated form documents."""
import uuid
from fastapi import HTTPException
from sqlalchemy import select

from app.modules.files.models.file import Asset, VirusScan

SAFE_FORM_IMAGE_MIME = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def image_magic_matches(mime_type: str, data: bytes) -> bool:
    return bool(
        (mime_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"))
        or (mime_type == "image/jpeg" and data.startswith(b"\xff\xd8\xff"))
        or (mime_type == "image/gif" and data[:6] in {b"GIF87a", b"GIF89a"})
        or (mime_type == "image/webp" and data.startswith(b"RIFF") and data[8:12] == b"WEBP")
    )


def document_asset_ids(settings: dict) -> set[uuid.UUID]:
    theme = settings.get("theme") if isinstance(settings, dict) else None
    raw = theme.get("header_banner_asset_id") if isinstance(theme, dict) else None
    if raw is None:
        return set()
    try:
        return {uuid.UUID(str(raw))}
    except (TypeError, ValueError):
        raise HTTPException(422, detail={"code": "INVALID_MANAGED_ASSET_REFERENCE"})


async def require_form_assets(db, *, organization_id, settings: dict, lock=False):
    ids = document_asset_ids(settings)
    if not ids:
        return
    if organization_id is None:
        raise HTTPException(422, detail={"code": "TENANT_MANAGED_ASSET_REQUIRED"})
    statement = select(Asset).where(Asset.id.in_(ids),
        Asset.organization_id == organization_id,
        Asset.processing_status == "READY").order_by(Asset.id)
    if lock:
        statement = statement.with_for_update(read=True)
    rows = list((await db.scalars(statement)).all())
    if {row.id for row in rows} != ids:
        raise HTTPException(409, detail={"code": "MANAGED_ASSET_NOT_SCAN_READY"})
    for asset in rows:
        if (asset.mime_type or "").lower() not in SAFE_FORM_IMAGE_MIME:
            raise HTTPException(422, detail={"code": "MANAGED_FORM_ASSET_TYPE_INVALID"})
        latest = await db.scalar(select(VirusScan.status).where(VirusScan.asset_id == asset.id)
            .order_by(VirusScan.scanned_at.desc(), VirusScan.id.desc()).limit(1))
        if latest != "clean":
            raise HTTPException(409, detail={"code": "MANAGED_ASSET_NOT_SCAN_READY"})
