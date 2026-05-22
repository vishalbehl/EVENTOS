# =============================================================
# Conference Platform — Thumbnail Generator
# workers/lib/thumbnail_generator.py
#
# Generates WEBP thumbnails from:
#   - PPTX  → LibreOffice renders first slide to PNG, then Pillow
#   - PDF   → pdf2image renders first page, then Pillow
#   - Video → FFmpeg seeks to 5s mark, extracts one frame
# =============================================================

from __future__ import annotations

import io
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from loguru import logger

from workers.config import settings


# ── PPTX ─────────────────────────────────────────────────────

def generate_pptx_thumbnail(pptx_data: bytes) -> Optional[bytes]:
    """
    Renders the first slide of a PPTX to a WEBP thumbnail.
    Requires LibreOffice installed at /usr/bin/libreoffice (or soffice).
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        pptx_path = Path(tmp_dir) / "input.pptx"
        pptx_path.write_bytes(pptx_data)

        lo_bin = _find_libreoffice()
        if lo_bin is None:
            logger.warning("LibreOffice not found — skipping PPTX thumbnail.")
            return None

        # Export first slide to PNG using LibreOffice headless
        try:
            result = subprocess.run(
                [
                    lo_bin, "--headless",
                    "--convert-to", "png",
                    "--outdir", tmp_dir,
                    str(pptx_path),
                ],
                capture_output=True,
                timeout=60,
                check=True,
            )
        except subprocess.TimeoutExpired:
            logger.error("LibreOffice timed out generating thumbnail.")
            return None
        except subprocess.CalledProcessError as exc:
            logger.error(f"LibreOffice conversion failed: {exc.stderr.decode()}")
            return None

        # LibreOffice outputs input.png in the same directory
        png_path = Path(tmp_dir) / "input.png"
        if not png_path.exists():
            # It may add a slide number suffix
            candidates = list(Path(tmp_dir).glob("input*.png"))
            if not candidates:
                logger.error("LibreOffice produced no PNG output.")
                return None
            png_path = sorted(candidates)[0]

        return _resize_and_encode(png_path.read_bytes(), "PNG")


# ── PDF ───────────────────────────────────────────────────────

def generate_pdf_thumbnail(pdf_data: bytes) -> Optional[bytes]:
    """
    Renders the first page of a PDF to a WEBP thumbnail.
    Uses pdf2image (requires poppler-utils system package).
    """
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        logger.warning("pdf2image not installed — skipping PDF thumbnail.")
        return None

    try:
        pages = convert_from_bytes(
            pdf_data,
            first_page=1,
            last_page=1,
            dpi=120,
            fmt="ppm",
        )
        if not pages:
            return None
        buf = io.BytesIO()
        pages[0].save(buf, format="PNG")
        return _resize_and_encode(buf.getvalue(), "PNG")
    except Exception as exc:
        logger.error(f"PDF thumbnail generation failed: {exc}")
        return None


# ── Video ─────────────────────────────────────────────────────

def generate_video_thumbnail(video_data: bytes) -> Optional[bytes]:
    """
    Extracts a frame at ~5s from a video using FFmpeg.
    Returns a WEBP-encoded bytes, or None on failure.
    """
    if not _ffmpeg_available():
        logger.warning("FFmpeg not found — skipping video thumbnail.")
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = Path(tmp_dir) / "input.mp4"
        thumb_path = Path(tmp_dir) / "thumb.png"
        video_path.write_bytes(video_data)

        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", "00:00:05",      # seek to 5 seconds
                    "-i", str(video_path),
                    "-vframes", "1",
                    "-vf", f"scale={settings.THUMBNAIL_WIDTH}:{settings.THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease",
                    str(thumb_path),
                ],
                capture_output=True,
                timeout=30,
                check=True,
            )
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
            logger.error(f"FFmpeg frame extraction failed: {exc}")
            return None

        if not thumb_path.exists():
            return None
        return _resize_and_encode(thumb_path.read_bytes(), "PNG")


# ── Shared ────────────────────────────────────────────────────

def _resize_and_encode(raw_png: bytes, src_format: str) -> Optional[bytes]:
    """Resize raw image bytes to target dimensions and encode as WEBP."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw_png))
        img = img.convert("RGB")
        img.thumbnail(
            (settings.THUMBNAIL_WIDTH, settings.THUMBNAIL_HEIGHT),
            Image.LANCZOS,
        )
        buf = io.BytesIO()
        img.save(
            buf,
            format=settings.THUMBNAIL_FORMAT,
            quality=settings.THUMBNAIL_QUALITY,
        )
        return buf.getvalue()
    except Exception as exc:
        logger.error(f"Thumbnail resize/encode failed: {exc}")
        return None


def _find_libreoffice() -> Optional[str]:
    candidates = [
        "soffice",
        "/usr/bin/libreoffice",
        "/usr/bin/soffice",
        "/usr/lib/libreoffice/program/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for c in candidates:
        result = subprocess.run(["which", c], capture_output=True)
        if result.returncode == 0:
            return c
        if Path(c).exists():
            return c
    return None


def _ffmpeg_available() -> bool:
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"], capture_output=True, timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
