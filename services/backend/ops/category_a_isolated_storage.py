"""Disposable local provider for real Category A probes; never existing volumes."""
from contextlib import contextmanager
import json
import os
import secrets
import subprocess
import time
import uuid

import boto3
from botocore.config import Config


@contextmanager
def isolated_storage(bucket):
    image = subprocess.run(["docker", "inspect", "conf-platform-cloud-minio-1",
        "--format", "{{.Image}}"], check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    if not image.startswith("sha256:"):
        raise RuntimeError("Existing local provider image identity is required")
    username, password = "categoryatest", secrets.token_urlsafe(32)
    environment = {**os.environ, "MINIO_ROOT_USER": username, "MINIO_ROOT_PASSWORD": password}
    container = subprocess.run(["docker", "run", "--detach", "--rm", "--name",
        f"category-a-upload-proof-{uuid.uuid4().hex}", "--publish", "127.0.0.1::9000",
        "--env", "MINIO_ROOT_USER", "--env", "MINIO_ROOT_PASSWORD", image, "server", "/data"],
        env=environment, check=True, capture_output=True, text=True, timeout=20).stdout.strip()
    client = None
    try:
        ports = json.loads(subprocess.run(["docker", "inspect", container,
            "--format", "{{json .NetworkSettings.Ports}}"], check=True, capture_output=True,
            text=True, timeout=10).stdout)
        binding = ports["9000/tcp"][0]
        if binding["HostIp"] != "127.0.0.1":
            raise RuntimeError("Disposable provider must be loopback-only")
        endpoint = f"http://127.0.0.1:{int(binding['HostPort'])}"
        client = boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=username,
            aws_secret_access_key=password, region_name="us-east-1",
            config=Config(connect_timeout=1, read_timeout=1, retries={"max_attempts": 0},
                s3={"addressing_style": "path"}))
        deadline = time.monotonic() + 30
        while True:
            try:
                client.list_buckets()
                break
            except Exception:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Disposable provider did not become ready") from None
                time.sleep(0.25)
        client.create_bucket(Bucket=bucket)
        yield endpoint, username, password
    finally:
        if client:
            client.close()
        # Only the exact no-volume container created above is removed.
        subprocess.run(["docker", "stop", "--time", "3", container], check=True,
            capture_output=True, text=True, timeout=15)
