import boto3
from botocore.client import Config
from app.config import settings

def get_minio_client():
    return boto3.client(
        "s3",
        endpoint_url=f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        config=Config(signature_version="s3v4", connect_timeout=1, read_timeout=1, retries={'max_attempts': 0}),
        region_name="us-east-1",  # Dummy region for MinIO
    )

minio_client = get_minio_client()

def ensure_bucket_exists():
    try:
        minio_client.head_bucket(Bucket=settings.LOCAL_BUCKET_NAME)
    except Exception:
        # Bucket does not exist or we don't have access
        try:
            minio_client.create_bucket(Bucket=settings.LOCAL_BUCKET_NAME)
        except Exception as e:
            print(f"Warning: Failed to create MinIO bucket {settings.LOCAL_BUCKET_NAME}: {e}")
