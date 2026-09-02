"""Remove only upload artifacts created by a dedicated staging test organization."""

from __future__ import annotations

import argparse
import asyncio
import uuid

import boto3
from sqlalchemy import delete, select

import app.models  # noqa: F401 - register mappings before the session starts
from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.files.models.file import DurableUpload


async def cleanup(organization_id: uuid.UUID) -> int:
    async with AsyncSessionLocal() as db:
        rows = list(
            (
                await db.scalars(
                    select(DurableUpload).where(
                        DurableUpload.organization_id == organization_id
                    )
                )
            ).all()
        )
        client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID or None,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY or None,
        )
        for row in rows:
            try:
                client.delete_object(
                    Bucket=getattr(row, "storage_bucket", None)
                    or settings.S3_BUCKET_ASSETS,
                    Key=row.object_key,
                )
            except Exception as exc:
                raise RuntimeError(
                    f"Could not remove test object {row.object_key!r}: {type(exc).__name__}"
                ) from exc
        await db.execute(
            delete(DurableUpload).where(
                DurableUpload.organization_id == organization_id
            )
        )
        await db.commit()
        return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--organization-id", required=True, type=uuid.UUID)
    args = parser.parse_args()
    removed = asyncio.run(cleanup(args.organization_id))
    print(f"removed_upload_records={removed}")


if __name__ == "__main__":
    main()
