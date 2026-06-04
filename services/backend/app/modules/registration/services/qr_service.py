# =============================================================
# Conference Platform — QR Code Service
# backend/app/services/qr_service.py
#
# Generates speaker QR codes for:
#   1. Speaker Ready Room (SRR) check-in badges
#   2. Speaker upload portal deep-links
#
# QR images are:
#   - Generated as PNG bytes in-memory (Pillow + qrcode)
#   - Uploaded to R2 /thumbnails bucket
#   - URL stored on the Speaker record (qr_code_url)
# =============================================================

from __future__ import annotations

import io
import uuid
from typing import Optional

import qrcode
import qrcode.image.pil
from loguru import logger
from PIL import Image, ImageDraw, ImageFont

from app.config import settings
from app.modules.presentations.services.upload_service import build_thumbnail_path, upload_bytes


# ── URL builders ──────────────────────────────────────────────

def build_srr_checkin_url(speaker_id: uuid.UUID) -> str:
    """
    URL encoded into the speaker's QR badge for SRR check-in.
    The Kiosk App reads this QR and looks up the speaker by ID.

    Format: {base}/srr/checkin/{speaker_id}
    """
    return f"{settings.QR_CODE_BASE_URL}/srr/checkin/{speaker_id}"


def build_upload_portal_url(upload_token: str, event_id: Optional[uuid.UUID] = None) -> str:
    """
    URL for speaker's personal upload portal link (also in their email).
    Format: {base}/{event_id}/{token}
    """
    if event_id:
        return f"{settings.SPEAKER_PORTAL_BASE_URL}/{event_id}/{upload_token}"
    return f"{settings.SPEAKER_PORTAL_BASE_URL}/{upload_token}"


# ── Core QR generation ────────────────────────────────────────

def generate_qr_code(
    data: str,
    *,
    box_size: int = settings.QR_CODE_BOX_SIZE,
    border: int = settings.QR_CODE_BORDER,
    fill_color: str = "#1a1a2e",
    back_color: str = "#ffffff",
) -> bytes:
    """
    Generate a QR code PNG from the given data string.

    Returns raw PNG bytes. Does NOT upload to storage — use
    `generate_and_upload_speaker_qr` for the full pipeline.

    Args:
        data:       The string to encode (URL or token)
        box_size:   Pixel size of each QR module (default from config)
        border:     Quiet zone width in modules (default from config)
        fill_color: Module fill color (dark)
        back_color: Background color (light)
    """
    qr = qrcode.QRCode(
        version=None,           # auto-determine minimum version
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # 30% recovery
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img: Image.Image = qr.make_image(
        image_factory=qrcode.image.pil.PilImage,
        fill_color=fill_color,
        back_color=back_color,
    ).get_image()

    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    buffer.seek(0)
    return buffer.read()


def generate_speaker_badge_qr(
    speaker_id: uuid.UUID,
    speaker_name: str,
    event_name: str,
    speaker_code: str,
    *,
    reg_no: Optional[str] = None,
    include_label: bool = True,
) -> bytes:
    """
    Generate a branded speaker QR badge PNG.

    Renders the QR code with:
      - Event Name on top as header
      - Speaker Name above the QR code
      - The QR code itself
      - Access Code or Registration No below the QR code

    Returns raw PNG bytes.
    """
    if reg_no:
        qr_text = reg_no
        code_text = f"Registration No: {reg_no}"
    else:
        qr_text = f"Speaker: {speaker_name}\nAccess Code: {speaker_code.upper()}"
        code_text = f"Access Code: {speaker_code.upper()}"

    qr_bytes = generate_qr_code(qr_text, box_size=12, border=3)

    if not include_label:
        return qr_bytes

    # Composite: QR code + header + speaker name + footer
    qr_img = Image.open(io.BytesIO(qr_bytes)).convert("RGBA")
    qr_w, qr_h = qr_img.size

    # Canvas: fit Event Name at top (45px) + Speaker Name (35px) + QR + Access Code at bottom (45px)
    header_h = 45
    name_h = 35
    footer_h = 45
    canvas_w = qr_w
    canvas_h = qr_h + header_h + name_h + footer_h

    canvas = Image.new("RGBA", (canvas_w, canvas_h), "#ffffff")
    canvas.paste(qr_img, (0, header_h + name_h))

    draw = ImageDraw.Draw(canvas)

    # Try to use a default font — fall back to PIL default if not available
    try:
        font_header = ImageFont.truetype("arial.ttf", size=18)
        font_name = ImageFont.truetype("arial.ttf", size=16)
        font_footer = ImageFont.truetype("arial.ttf", size=15)
    except (IOError, OSError):
        font_header = ImageFont.load_default()
        font_name = font_header
        font_footer = font_header

    # 1. Event Name Header
    event_text = event_name[:50]
    draw.text(
        (canvas_w // 2, 12),
        event_text,
        fill="#312e81",  # Elegant indigo-900
        font=font_header,
        anchor="mt",  # middle-top anchor
    )

    # 2. Speaker Name Above QR
    name_text = speaker_name[:40]  # truncate long names
    draw.text(
        (canvas_w // 2, header_h + 8),
        name_text,
        fill="#1e1b4b",  # Dark indigo-950
        font=font_name,
        anchor="mt",
    )

    # 3. Access Code / Reg No Below QR
    draw.text(
        (canvas_w // 2, header_h + name_h + qr_h + 10),
        code_text,
        fill="#4f46e5",  # Vibrant indigo-600
        font=font_footer,
        anchor="mt",
    )

    buffer = io.BytesIO()
    canvas.convert("RGB").save(buffer, format="PNG", optimize=True)
    buffer.seek(0)
    return buffer.read()


# ── Upload pipeline ───────────────────────────────────────────

def generate_and_upload_speaker_qr(
    speaker_id: uuid.UUID,
    speaker_name: str,
    event_name: str,
    speaker_code: str,
) -> str:
    """
    Full pipeline:
    1. Generate branded speaker badge QR PNG
    2. Upload to R2 /thumbnails bucket
    3. Return the public URL

    Raises RuntimeError if upload fails.
    """
    png_bytes = generate_speaker_badge_qr(speaker_id, speaker_name, event_name, speaker_code)

    # Storage path: thumbnails/qr/{speaker_id}.png
    storage_path = f"thumbnails/qr/{speaker_id}.png"

    upload_bytes(
        bucket=settings.S3_BUCKET_THUMBNAILS,
        storage_path=storage_path,
        data=png_bytes,
        content_type="image/png",
    )

    # Construct the public URL
    if settings.STORAGE_MODE == "local":
        qr_url = f"{settings.API_BASE_URL}/api/v1/storage/{settings.S3_BUCKET_THUMBNAILS}/{storage_path}"
    else:
        qr_url = f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_THUMBNAILS}/{storage_path}"
    logger.info(f"Generated and uploaded QR for speaker {speaker_id}: {qr_url}")
    return qr_url


def generate_upload_link_qr(upload_token: str, event_id: Optional[uuid.UUID] = None) -> bytes:
    """
    Generate a QR code for the speaker's upload portal URL.
    Used in the upload invitation email as an embedded image.

    Returns raw PNG bytes (not uploaded to storage).
    """
    url = build_upload_portal_url(upload_token, event_id=event_id)
    return generate_qr_code(url, box_size=8, border=2)
