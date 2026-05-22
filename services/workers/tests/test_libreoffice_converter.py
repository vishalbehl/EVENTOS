# workers/tests/test_libreoffice_converter.py
"""Tests for LibreOffice converter — subprocess mocked."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest


class TestConvertToPdf:
    def test_returns_none_when_libreoffice_missing(self):
        from workers.lib.libreoffice_converter import convert_to_pdf

        with patch("workers.lib.libreoffice_converter._find_libreoffice", return_value=None):
            result = convert_to_pdf(b"pptx data")

        assert result is None

    def test_returns_pdf_bytes_on_success(self):
        from workers.lib.libreoffice_converter import convert_to_pdf

        fake_pdf = b"%PDF-1.4 fake content"

        def fake_run(cmd, **kwargs):
            # Write fake PDF in the outdir
            outdir_idx = cmd.index("--outdir") + 1
            import os
            outdir = cmd[outdir_idx]
            with open(os.path.join(outdir, "input.pdf"), "wb") as f:
                f.write(fake_pdf)
            proc = MagicMock()
            proc.returncode = 0
            return proc

        with patch("workers.lib.libreoffice_converter._find_libreoffice", return_value="soffice"), \
             patch("subprocess.run", side_effect=fake_run):
            result = convert_to_pdf(b"fake pptx bytes", source_ext="pptx")

        assert result == fake_pdf

    def test_returns_none_on_timeout(self):
        from workers.lib.libreoffice_converter import convert_to_pdf

        with patch("workers.lib.libreoffice_converter._find_libreoffice", return_value="soffice"), \
             patch("subprocess.run", side_effect=subprocess.TimeoutExpired("soffice", 120)):
            result = convert_to_pdf(b"pptx")

        assert result is None

    def test_returns_none_on_process_error(self):
        from workers.lib.libreoffice_converter import convert_to_pdf

        with patch("workers.lib.libreoffice_converter._find_libreoffice", return_value="soffice"), \
             patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "soffice", stderr=b"crash")):
            result = convert_to_pdf(b"pptx")

        assert result is None

    def test_handles_different_source_extensions(self):
        from workers.lib.libreoffice_converter import convert_to_pdf

        fake_pdf = b"%PDF"

        def fake_run(cmd, **kwargs):
            outdir_idx = cmd.index("--outdir") + 1
            import os
            outdir = cmd[outdir_idx]
            # LibreOffice names output after input file
            for f in ["input.pdf"]:
                with open(os.path.join(outdir, f), "wb") as fh:
                    fh.write(fake_pdf)
            proc = MagicMock()
            proc.returncode = 0
            return proc

        for ext in ("ppt", "key", "pptx"):
            with patch("workers.lib.libreoffice_converter._find_libreoffice", return_value="soffice"), \
                 patch("subprocess.run", side_effect=fake_run):
                result = convert_to_pdf(b"data", source_ext=ext)
            assert result == fake_pdf, f"Failed for ext={ext}"


class TestFindLibreoffice:
    def test_returns_none_when_not_found(self):
        from workers.lib.libreoffice_converter import _find_libreoffice

        with patch("subprocess.run", side_effect=FileNotFoundError), \
             patch("pathlib.Path.exists", return_value=False):
            result = _find_libreoffice()

        assert result is None

    def test_returns_path_when_found_via_subprocess(self):
        from workers.lib.libreoffice_converter import _find_libreoffice

        proc = MagicMock()
        proc.returncode = 0

        with patch("subprocess.run", return_value=proc):
            result = _find_libreoffice()

        assert result is not None
