from pathlib import Path

import pytest

from app.workers.backup_worker import execute_backup, verify_backup_manifest


def test_content_backup_is_verified_against_manifest(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "slides.pptx").write_bytes(b"presentation bytes")

    result = execute_backup("backup-test-1234", "content", str(tmp_path / "destination"), str(source))

    root = Path(result["root"])
    verify_backup_manifest(root, result["manifest"])
    assert result["manifest"]["content"]["file_count"] == 1


def test_backup_verification_rejects_tampered_content(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "slides.pptx").write_bytes(b"presentation bytes")
    result = execute_backup("backup-test-5678", "content", str(tmp_path / "destination"), str(source))

    content_file = Path(result["root"]) / "content" / "slides.pptx"
    content_file.write_bytes(b"tampered")

    with pytest.raises(RuntimeError, match="checksum mismatch"):
        verify_backup_manifest(Path(result["root"]), result["manifest"])
