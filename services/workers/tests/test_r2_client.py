# workers/tests/test_r2_client.py
"""Tests for R2Client — all S3 calls are mocked."""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch, call

import pytest


class TestR2ClientDownload:
    def test_download_bytes_success(self):
        from workers.lib.r2_client import R2Client
        client = R2Client()
        expected = b"file content here"

        def fake_download(bucket, key, buf):
            buf.write(expected)

        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            boto_client.download_fileobj.side_effect = fake_download
            mock_make.return_value = boto_client

            result = client.download_bytes("test-bucket", "path/to/file.pptx")

        assert result == expected
        # Verify it was called exactly once with correct bucket + key
        assert boto_client.download_fileobj.call_count == 1
        call_args = boto_client.download_fileobj.call_args[0]
        assert call_args[0] == "test-bucket"
        assert call_args[1] == "path/to/file.pptx"

    def test_download_bytes_calls_correct_args(self):
        from workers.lib.r2_client import R2Client
        from botocore.exceptions import ClientError

        client = R2Client()
        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            error_resp = {"Error": {"Code": "NoSuchKey", "Message": "Not Found"}}
            boto_client.download_fileobj.side_effect = ClientError(error_resp, "GetObject")
            mock_make.return_value = boto_client

            with pytest.raises(ClientError):
                client.download_bytes("bucket", "missing/key")


class TestR2ClientUpload:
    def test_upload_bytes_success(self):
        from workers.lib.r2_client import R2Client
        client = R2Client()

        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            mock_make.return_value = boto_client

            client.upload_bytes("bucket", "path/thumb.webp", b"image", "image/webp")

        boto_client.put_object.assert_called_once_with(
            Bucket="bucket",
            Key="path/thumb.webp",
            Body=b"image",
            ContentType="image/webp",
        )

    def test_upload_bytes_with_metadata(self):
        from workers.lib.r2_client import R2Client
        client = R2Client()

        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            mock_make.return_value = boto_client

            client.upload_bytes(
                "bucket", "path/file", b"data",
                metadata={"file_id": "abc123"}
            )

        call_kwargs = boto_client.put_object.call_args[1]
        assert call_kwargs["Metadata"] == {"file_id": "abc123"}


class TestR2ClientExists:
    def test_object_exists_true(self):
        from workers.lib.r2_client import R2Client
        client = R2Client()

        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            boto_client.head_object.return_value = {}
            mock_make.return_value = boto_client

            assert client.object_exists("bucket", "existing/key") is True

    def test_object_exists_false(self):
        from workers.lib.r2_client import R2Client
        from botocore.exceptions import ClientError

        client = R2Client()
        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            error_resp = {"Error": {"Code": "404", "Message": "Not Found"}}
            boto_client.head_object.side_effect = ClientError(error_resp, "HeadObject")
            mock_make.return_value = boto_client

            assert client.object_exists("bucket", "missing/key") is False


class TestR2ClientDelete:
    def test_delete_object_success(self):
        from workers.lib.r2_client import R2Client
        client = R2Client()

        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            mock_make.return_value = boto_client

            client.delete_object("bucket", "path/to/delete")

        boto_client.delete_object.assert_called_once_with(
            Bucket="bucket", Key="path/to/delete"
        )


class TestR2ClientPresignedUrl:
    def test_generate_presigned_url(self):
        from workers.lib.r2_client import R2Client
        client = R2Client()

        with patch("workers.lib.r2_client._make_client") as mock_make:
            boto_client = MagicMock()
            boto_client.generate_presigned_url.return_value = "https://signed.url/key"
            mock_make.return_value = boto_client

            url = client.generate_presigned_url("bucket", "path/file", expiry=3600)

        assert url == "https://signed.url/key"
        boto_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "bucket", "Key": "path/file"},
            ExpiresIn=3600,
        )
