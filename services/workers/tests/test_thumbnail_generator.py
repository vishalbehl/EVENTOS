# workers/tests/test_thumbnail_generator.py
"""Tests for the thumbnail generator — subprocess and Pillow mocked."""

from __future__ import annotations

import io
from unittest.mock import MagicMock, patch

import pytest


def _make_white_png(w=100, h=100) -> bytes:
    """Create a real tiny PNG in memory using Pillow."""
    try:
        from PIL import Image
    except ImportError:
        pytest.skip("Pillow not installed")
    img = Image.new("RGB", (w, h), color=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestResizeAndEncode:
    def test_returns_webp_bytes(self):
        from workers.lib.thumbnail_generator import _resize_and_encode
        png = _make_white_png(200, 200)
        result = _resize_and_encode(png, "PNG")
        assert result is not None
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_handles_invalid_image(self):
        from workers.lib.thumbnail_generator import _resize_and_encode
        result = _resize_and_encode(b"not-an-image", "PNG")
        assert result is None

    def test_empty_bytes_returns_none(self):
        from workers.lib.thumbnail_generator import _resize_and_encode
        result = _resize_and_encode(b"", "PNG")
        assert result is None


class TestGeneratePptxThumbnail:
    def test_returns_none_when_libreoffice_missing(self):
        from workers.lib.thumbnail_generator import generate_pptx_thumbnail

        with patch("workers.lib.thumbnail_generator._find_libreoffice", return_value=None):
            result = generate_pptx_thumbnail(b"pptx data")

        assert result is None

    def test_returns_bytes_on_success(self):
        from workers.lib.thumbnail_generator import generate_pptx_thumbnail

        png_bytes = _make_white_png(960, 540)

        def fake_run(cmd, **kwargs):
            # Find the outdir and create a fake PNG there
            outdir_idx = cmd.index("--outdir") + 1
            outdir = cmd[outdir_idx]
            import os
            with open(os.path.join(outdir, "input.png"), "wb") as f:
                f.write(png_bytes)
            proc = MagicMock()
            proc.returncode = 0
            return proc

        with patch("workers.lib.thumbnail_generator._find_libreoffice", return_value="soffice"), \
             patch("subprocess.run", side_effect=fake_run):
            result = generate_pptx_thumbnail(b"fake pptx")

        assert result is not None
        assert isinstance(result, bytes)

    def test_returns_none_on_libreoffice_timeout(self):
        import subprocess
        from workers.lib.thumbnail_generator import generate_pptx_thumbnail

        with patch("workers.lib.thumbnail_generator._find_libreoffice", return_value="soffice"), \
             patch("subprocess.run", side_effect=subprocess.TimeoutExpired("soffice", 60)):
            result = generate_pptx_thumbnail(b"data")

        assert result is None

    def test_returns_none_on_libreoffice_error(self):
        import subprocess
        from workers.lib.thumbnail_generator import generate_pptx_thumbnail

        with patch("workers.lib.thumbnail_generator._find_libreoffice", return_value="soffice"), \
             patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, "soffice", stderr=b"err")):
            result = generate_pptx_thumbnail(b"data")

        assert result is None


class TestGeneratePdfThumbnail:
    def test_returns_none_when_pdf2image_missing(self):
        from workers.lib.thumbnail_generator import generate_pdf_thumbnail
        import sys

        with patch.dict(sys.modules, {"pdf2image": None}):
            result = generate_pdf_thumbnail(b"pdf data")

        assert result is None

    def test_returns_bytes_on_success(self):
        from workers.lib.thumbnail_generator import generate_pdf_thumbnail
        from PIL import Image

        fake_page = Image.new("RGB", (960, 540), color=(200, 200, 200))
        mock_module = MagicMock()
        mock_module.convert_from_bytes.return_value = [fake_page]

        with patch.dict("sys.modules", {"pdf2image": mock_module}):
            result = generate_pdf_thumbnail(b"pdf bytes")

        assert result is not None
        assert isinstance(result, bytes)


class TestGenerateVideoThumbnail:
    def test_returns_none_when_ffmpeg_missing(self):
        from workers.lib.thumbnail_generator import generate_video_thumbnail

        with patch("workers.lib.thumbnail_generator._ffmpeg_available", return_value=False):
            result = generate_video_thumbnail(b"video data")

        assert result is None

    def test_returns_bytes_on_success(self):
        from workers.lib.thumbnail_generator import generate_video_thumbnail

        png_bytes = _make_white_png(640, 360)

        def fake_run(cmd, **kwargs):
            # Find output path (last positional arg to ffmpeg)
            out_path = cmd[-1]
            with open(out_path, "wb") as f:
                f.write(png_bytes)
            proc = MagicMock()
            proc.returncode = 0
            return proc

        with patch("workers.lib.thumbnail_generator._ffmpeg_available", return_value=True), \
             patch("subprocess.run", side_effect=fake_run):
            result = generate_video_thumbnail(b"video")

        assert result is not None
        assert isinstance(result, bytes)
