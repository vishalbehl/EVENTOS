# =============================================================
# Conference Platform — LibreOffice Converter
# workers/lib/libreoffice_converter.py
#
# Converts PPTX / PPT / KEY files to PDF using LibreOffice.
# The resulting PDF is used for:
#   - Thumbnail generation
#   - Preview in Organizer Portal
#   - Fallback rendering on venue PCs without MS Office
# =============================================================

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from loguru import logger


def convert_to_pdf(data: bytes, source_ext: str = "pptx") -> Optional[bytes]:
    """
    Convert a presentation file to PDF using LibreOffice headless.

    Args:
        data:       Raw bytes of the source file.
        source_ext: File extension without dot (e.g. "pptx", "ppt", "key").

    Returns:
        Raw PDF bytes, or None if conversion failed.
    """
    lo_bin = _find_libreoffice()
    if lo_bin is None:
        logger.error("LibreOffice not available — cannot convert to PDF.")
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = Path(tmp_dir) / f"input.{source_ext.lstrip('.')}"
        input_path.write_bytes(data)
        output_path = Path(tmp_dir) / "input.pdf"

        try:
            subprocess.run(
                [
                    lo_bin, "--headless",
                    "--convert-to", "pdf",
                    "--outdir", tmp_dir,
                    str(input_path),
                ],
                capture_output=True,
                timeout=120,
                check=True,
            )
        except subprocess.TimeoutExpired:
            logger.error("LibreOffice PDF conversion timed out (>120s).")
            return None
        except subprocess.CalledProcessError as exc:
            logger.error(
                f"LibreOffice conversion failed: "
                f"stdout={(exc.stdout or b'').decode()[:500]} "
                f"stderr={(exc.stderr or b'').decode()[:500]}"
            )
            return None

        if not output_path.exists():
            # LibreOffice may generate a file with the original name
            candidates = list(Path(tmp_dir).glob("*.pdf"))
            if not candidates:
                logger.error("LibreOffice produced no PDF output.")
                return None
            output_path = candidates[0]

        pdf_data = output_path.read_bytes()
        logger.info(
            f"LibreOffice conversion OK: {source_ext} → PDF "
            f"({len(pdf_data):,} bytes)"
        )
        return pdf_data


def _find_libreoffice() -> Optional[str]:
    candidates = [
        "soffice",
        "/usr/bin/libreoffice",
        "/usr/bin/soffice",
        "/usr/lib/libreoffice/program/soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ]
    for c in candidates:
        try:
            result = subprocess.run(
                [c, "--version"], capture_output=True, timeout=5
            )
            if result.returncode == 0:
                return c
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        if Path(c).exists():
            return c
    return None
