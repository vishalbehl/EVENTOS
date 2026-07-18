# =============================================================
# Conference Platform — R2 / S3 Client (Workers)
# workers/lib/r2_client.py
#
# Thin wrapper around boto3 for Cloudflare R2 / AWS S3.
# Workers download files for processing and upload results.
# =============================================================

from __future__ import annotations

import io
import os
from typing import BinaryIO, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from loguru import logger

from workers.config import settings


def _make_client():
    kwargs = dict(
        region_name=settings.S3_REGION,
        config=Config(
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=10,
            read_timeout=120,
        ),
    )
    if settings.S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    if settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY
    return boto3.client("s3", **kwargs)


class R2Client:
    """
    Thread-safe S3/R2 client wrapper.

    Each method instantiates a fresh boto3 client so the class
    can safely be used across Celery worker processes without
    sharing a socket.
    """

    def download_bytes(self, bucket: str, key: str) -> bytes:
        """Download an object and return its raw bytes."""
        client = _make_client()
        buf = io.BytesIO()
        try:
            client.download_fileobj(bucket, key, buf)
        except ClientError as exc:
            logger.error(f"R2 download failed: {bucket}/{key} — {exc}")
            raise
        return buf.getvalue()

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> None:
        """Upload raw bytes to a bucket key."""
        client = _make_client()
        kwargs: dict = {
            "Body": data,
            "ContentType": content_type,
        }
        if metadata:
            kwargs["Metadata"] = metadata
        try:
            client.put_object(Bucket=bucket, Key=key, **kwargs)
            logger.debug(f"R2 upload OK: {bucket}/{key} ({len(data):,} bytes)")
        except ClientError as exc:
            logger.error(f"R2 upload failed: {bucket}/{key} — {exc}")
            raise

    def upload_file(
        self,
        bucket: str,
        key: str,
        local_path: str,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Upload a local file to a bucket key (streaming, memory-efficient)."""
        client = _make_client()
        try:
            client.upload_file(
                Filename=local_path,
                Bucket=bucket,
                Key=key,
                ExtraArgs={"ContentType": content_type},
            )
            size = os.path.getsize(local_path)
            logger.debug(f"R2 file upload OK: {bucket}/{key} ({size:,} bytes)")
        except ClientError as exc:
            logger.error(f"R2 file upload failed: {bucket}/{key} — {exc}")
            raise

    def delete_object(self, bucket: str, key: str) -> None:
        client = _make_client()
        try:
            client.delete_object(Bucket=bucket, Key=key)
        except ClientError as exc:
            logger.warning(f"R2 delete failed (non-fatal): {bucket}/{key} — {exc}")

    def object_exists(self, bucket: str, key: str) -> bool:
        client = _make_client()
        try:
            client.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError:
            return False

    def generate_presigned_url(
        self,
        bucket: str,
        key: str,
        expiry: int = 3600,
    ) -> str:
        """Generate a time-limited presigned GET URL."""
        client = _make_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiry,
        )


# Module-level singleton — re-use across tasks in same worker
r2 = R2Client()
