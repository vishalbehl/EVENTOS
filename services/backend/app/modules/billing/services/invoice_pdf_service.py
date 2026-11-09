"""Premium, certificate-signable EventOS invoice PDF rendering.

The renderer accepts an immutable invoice snapshot. It never re-reads mutable
commercial state, which keeps regenerated version-bound invoices stable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
from typing import Any, Iterable


_ASSET_ROOT = Path(__file__).resolve().parents[1] / "assets" / "fonts"
_FONT_REGULAR = _ASSET_ROOT / "Poppins-Regular.ttf"
_FONT_SEMIBOLD = _ASSET_ROOT / "Poppins-SemiBold.ttf"
_FONT_BOLD = _ASSET_ROOT / "Poppins-Bold.ttf"

NAVY = "#10162F"
INK = "#151A39"
MUTED = "#5D6380"
VIOLET = "#4D2DBD"
VIOLET_DARK = "#342091"
LAVENDER = "#F2EFFF"
LAVENDER_2 = "#FAF9FF"
LINE = "#D8DCEB"
GREEN = "#1D9B56"
GREEN_SOFT = "#D9F7E4"
WHITE = "#FFFFFF"


@dataclass(frozen=True)
class InvoicePdfSigningConfig:
    """Certificate-backed PDF signing configuration.

    PKCS#12 files must be supplied through a mounted secret, never stored in
    the repository or database.
    """

    pkcs12_path: str = ""
    pkcs12_password: str = ""
    signer_name: str = "EventOS IT Solutions"
    reason: str = "Authorised EventOS tax invoice"
    location: str = "Delhi, India"
    tsa_url: str = ""
    required: bool = False

    @classmethod
    def from_settings(cls, settings: Any) -> "InvoicePdfSigningConfig":
        return cls(
            pkcs12_path=str(getattr(settings, "INVOICE_SIGNING_PKCS12_PATH", "") or ""),
            pkcs12_password=str(getattr(settings, "INVOICE_SIGNING_PKCS12_PASSWORD", "") or ""),
            signer_name=str(
                getattr(settings, "INVOICE_SIGNER_NAME", "EventOS IT Solutions")
                or "EventOS IT Solutions"
            ),
            reason=str(
                getattr(settings, "INVOICE_SIGNING_REASON", "Authorised EventOS tax invoice")
                or "Authorised EventOS tax invoice"
            ),
            location=str(getattr(settings, "INVOICE_SIGNING_LOCATION", "Delhi, India") or "Delhi, India"),
            tsa_url=str(getattr(settings, "INVOICE_SIGNING_TSA_URL", "") or ""),
            required=bool(getattr(settings, "INVOICE_PDF_REQUIRE_CRYPTOGRAPHIC_SIGNATURE", False)),
        )


def invoice_issuer_from_settings(settings: Any) -> dict[str, str]:
    return {
        "name": str(getattr(settings, "INVOICE_ISSUER_NAME", "EventOS IT Solutions") or "EventOS IT Solutions"),
        "address": str(getattr(settings, "INVOICE_ISSUER_ADDRESS", "Delhi, India") or "Delhi, India"),
        "gstin": str(getattr(settings, "INVOICE_ISSUER_GSTIN", "") or ""),
        "pan": str(getattr(settings, "INVOICE_ISSUER_PAN", "") or ""),
        "sac": str(getattr(settings, "INVOICE_ISSUER_SAC", "998314") or "998314"),
        "website": str(getattr(settings, "INVOICE_ISSUER_WEBSITE", "www.eventos.com") or "www.eventos.com"),
        "email": str(getattr(settings, "INVOICE_ISSUER_EMAIL", "billing@eventos.com") or "billing@eventos.com"),
        "phone": str(getattr(settings, "INVOICE_ISSUER_PHONE", "+91 11 4703 8800") or "+91 11 4703 8800"),
    }


def _register_fonts() -> None:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    required = (_FONT_REGULAR, _FONT_SEMIBOLD, _FONT_BOLD)
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError(f"Invoice font assets are missing: {', '.join(missing)}")
    if "Poppins" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Poppins", str(_FONT_REGULAR)))
        pdfmetrics.registerFont(TTFont("Poppins-SemiBold", str(_FONT_SEMIBOLD)))
        pdfmetrics.registerFont(TTFont("Poppins-Bold", str(_FONT_BOLD)))


def _decimal(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value if value is not None else default))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def _indian_grouped(value: Decimal) -> str:
    quantized = value.quantize(Decimal("0.01"))
    sign = "-" if quantized < 0 else ""
    whole, fractional = f"{abs(quantized):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups: list[str] = []
        while head:
            groups.append(head[-2:])
            head = head[:-2]
        whole = ",".join(reversed(groups)) + "," + tail
    suffix = "" if fractional == "00" else f".{fractional}"
    return f"{sign}{whole}{suffix}"


def _money(value: Any, currency: str = "INR") -> str:
    prefix = "₹" if currency.upper() == "INR" else currency.upper()
    return f"{prefix} {_indian_grouped(_decimal(value))}"


def _date(value: Any) -> str:
    if not value:
        return "Not recorded"
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return str(value)
    return parsed.strftime("%d %b %Y")


def _canonical_reference(snapshot: dict[str, Any]) -> str:
    payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest().upper()[:24]


def _fit(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: max(1, limit - 1)].rstrip() + "…"


def _wrapped_lines(canvas, text: Any, font_name: str, font_size: float, width: float, *, max_lines: int = 3) -> list[str]:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    words = str(text or "").replace("\n", " ").split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if stringWidth(candidate, font_name, font_size) <= width:
            current = candidate
            continue
        lines.append(current)
        current = word
        if len(lines) == max_lines - 1:
            break
    if len(lines) < max_lines:
        lines.append(current)
    consumed = " ".join(lines)
    original = " ".join(words)
    if consumed != original and lines:
        while lines[-1] and stringWidth(lines[-1] + "…", font_name, font_size) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] = lines[-1].rstrip() + "…"
    return lines[:max_lines]


def _draw_lines(canvas, lines: Iterable[str], x: float, y: float, *, font: str = "Poppins", size: float = 8, color: str = INK, leading: float = 11) -> None:
    from reportlab.lib.colors import HexColor

    canvas.setFillColor(HexColor(color))
    canvas.setFont(font, size)
    for index, line in enumerate(lines):
        canvas.drawString(x, y - index * leading, line)


def _round_rect(canvas, x: float, y: float, width: float, height: float, radius: float, *, fill: str, stroke: str | None = None, line_width: float = 0.6) -> None:
    from reportlab.lib.colors import HexColor

    canvas.setFillColor(HexColor(fill))
    canvas.setStrokeColor(HexColor(stroke or fill))
    canvas.setLineWidth(line_width)
    canvas.roundRect(x, y, width, height, radius, fill=1, stroke=1 if stroke else 0)


def _draw_eventos_mark(canvas, x: float, y: float, scale: float = 1.0) -> None:
    """Draw the angular EventOS emblem as vectors for sharp print output."""
    from reportlab.lib.colors import HexColor

    canvas.saveState()
    canvas.translate(x, y)
    canvas.scale(scale, scale)
    canvas.setFillColor(HexColor(VIOLET))
    path = canvas.beginPath()
    path.moveTo(2, 20); path.lineTo(15, 28); path.lineTo(28, 20)
    path.lineTo(23, 16); path.lineTo(15, 21); path.lineTo(8, 17)
    path.lineTo(8, 9); path.lineTo(15, 5); path.lineTo(23, 9)
    path.lineTo(28, 5); path.lineTo(15, -3); path.lineTo(2, 5); path.close()
    canvas.drawPath(path, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#8F60FF"))
    inner = canvas.beginPath()
    inner.moveTo(8, 9); inner.lineTo(15, 13); inner.lineTo(23, 9)
    inner.lineTo(15, 5); inner.close()
    canvas.drawPath(inner, fill=1, stroke=0)
    canvas.restoreState()


def _draw_checkmark(canvas, x: float, y: float, *, color: str = GREEN, scale: float = 1.0) -> None:
    from reportlab.lib.colors import HexColor

    canvas.saveState()
    canvas.setStrokeColor(HexColor(color))
    canvas.setLineWidth(1.7 * scale)
    canvas.setLineCap(1)
    path = canvas.beginPath()
    path.moveTo(x, y + 3 * scale)
    path.lineTo(x + 3 * scale, y)
    path.lineTo(x + 9 * scale, y + 8 * scale)
    canvas.drawPath(path, fill=0, stroke=1)
    canvas.restoreState()


def _draw_calendar_icon(canvas, x: float, y: float, *, color: str = VIOLET) -> None:
    from reportlab.lib.colors import HexColor

    canvas.saveState()
    canvas.setStrokeColor(HexColor(color))
    canvas.setLineWidth(1)
    canvas.roundRect(x, y, 13, 13, 2, fill=0, stroke=1)
    canvas.line(x, y + 9, x + 13, y + 9)
    canvas.line(x + 3, y + 11, x + 3, y + 15)
    canvas.line(x + 10, y + 11, x + 10, y + 15)
    canvas.restoreState()


def _draw_brand_header(canvas, width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    _draw_eventos_mark(canvas, 31, height - 55, 1.18)
    canvas.setFillColor(HexColor(NAVY))
    canvas.setFont("Poppins-Bold", 20)
    canvas.drawString(73, height - 43, "EventOS")
    canvas.setFont("Poppins-SemiBold", 9)
    canvas.drawString(74, height - 58, "I T   S O L U T I O N S")
    canvas.setStrokeColor(HexColor(MUTED))
    canvas.setLineWidth(0.7)
    canvas.line(184, height - 68, 184, height - 30)
    canvas.setFont("Poppins-SemiBold", 9.5)
    canvas.drawString(200, height - 41, "Event & Conference")
    canvas.drawString(200, height - 54, "Technology Platform")
    canvas.setFont("Poppins-SemiBold", 5.8)
    canvas.setFillColor(HexColor(VIOLET_DARK))
    canvas.drawString(200, height - 68, "C L O U D   •   V E N U E   •   O P E R A T I O N S")

    canvas.saveState()
    canvas.setStrokeColor(HexColor("#C9B9FF"))
    canvas.setLineWidth(0.45)
    for offset in range(0, 28, 4):
        wave = canvas.beginPath()
        wave.moveTo(width - 235, height - 5 - offset * 0.22)
        wave.curveTo(width - 165, height - 75 + offset, width - 78, height - 5 - offset, width + 8, height - 46 + offset * 0.35)
        canvas.drawPath(wave, stroke=1, fill=0)
    canvas.restoreState()


def _draw_invoice_title(canvas, snapshot: dict[str, Any], width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    _round_rect(canvas, 26, height - 126, 38, 38, 10, fill=LAVENDER)
    canvas.setStrokeColor(HexColor(VIOLET))
    canvas.setLineWidth(1.7)
    canvas.rect(39, height - 115, 14, 18, fill=0, stroke=1)
    canvas.line(42, height - 103, 50, height - 103)
    canvas.line(42, height - 107, 50, height - 107)
    canvas.line(42, height - 111, 48, height - 111)
    canvas.setFillColor(HexColor(NAVY))
    canvas.setFont("Poppins-Bold", 29)
    canvas.drawString(73, height - 105, "Invoice")
    canvas.setFont("Poppins", 9)
    canvas.drawString(74, height - 120, "System Generated Tax Invoice")

    _round_rect(canvas, width - 205, height - 122, 177, 38, 10, fill="#F2F1F8")
    canvas.setFillColor(HexColor(INK))
    canvas.setFont("Poppins", 9)
    canvas.drawString(width - 190, height - 103, "Invoice #")
    canvas.setFillColor(HexColor(VIOLET))
    canvas.setFont("Poppins-Bold", 11)
    canvas.drawRightString(width - 42, height - 103, _fit(snapshot.get("invoice_number") or "Invoice", 22))


def _draw_party_columns(canvas, snapshot: dict[str, Any], width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    buyer = snapshot.get("buyer") or {}
    issuer = snapshot.get("issuer") or {}
    y = height - 163
    canvas.setStrokeColor(HexColor(LINE))
    canvas.line(width / 2, y + 2, width / 2, y - 74)
    for x, title, party in ((36, "Bill To", buyer), (width / 2 + 40, "From", issuer)):
        canvas.setStrokeColor(HexColor(VIOLET))
        canvas.setLineWidth(2)
        canvas.line(x - 9, y + 3, x - 9, y - 21)
        canvas.setFillColor(HexColor(INK))
        canvas.setFont("Poppins", 8)
        canvas.drawString(x, y, title)
        canvas.setFont("Poppins-Bold", 11.5)
        canvas.drawString(x, y - 17, _fit(party.get("name") or "Not recorded", 38))
        canvas.setFont("Poppins", 7.5)
        canvas.drawString(x, y - 38, f"●  {_fit(party.get('address') or 'Address not recorded', 54)}")
        gstin = party.get("gstin") or "Not registered"
        canvas.drawString(x, y - 56, f"▥  GSTIN: {_fit(gstin, 28)}")
        if title == "From":
            canvas.drawString(x, y - 72, f"PAN: {_fit(party.get('pan') or 'Not recorded', 18)}   |   SAC: {_fit(party.get('sac') or '998314', 10)}")


def _draw_meta_strip(canvas, snapshot: dict[str, Any], width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    y = height - 286
    _round_rect(canvas, 24, y, width - 48, 49, 9, fill=LAVENDER_2, stroke="#ECEAF5")
    columns = [
        (45, "Invoice Date", _date(snapshot.get("issued_at"))),
        (218, "Due Date", _date(snapshot.get("due_date"))),
        (391, "Status", str(snapshot.get("status") or "UNPAID").title()),
    ]
    for index, (x, label, value) in enumerate(columns):
        if index:
            canvas.setStrokeColor(HexColor(LINE)); canvas.line(x - 18, y + 8, x - 18, y + 41)
        _round_rect(canvas, x, y + 11, 27, 27, 7, fill=LAVENDER)
        if label == "Status":
            canvas.setStrokeColor(HexColor(VIOLET)); canvas.setLineWidth(1)
            canvas.circle(x + 13.5, y + 24, 7, fill=0, stroke=1)
            _draw_checkmark(canvas, x + 9.5, y + 21, color=VIOLET, scale=0.75)
        else:
            _draw_calendar_icon(canvas, x + 7, y + 18)
        canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins", 7)
        canvas.drawString(x + 38, y + 30, label)
        if label == "Status":
            _round_rect(canvas, x + 38, y + 9, 58, 18, 4, fill=GREEN_SOFT)
            canvas.setFillColor(HexColor(GREEN)); canvas.setFont("Poppins-SemiBold", 7.5)
            canvas.drawCentredString(x + 67, y + 14, value)
        else:
            canvas.setFont("Poppins-SemiBold", 9.5); canvas.drawString(x + 38, y + 14, value)


def _item_badge(item: dict[str, Any]) -> str:
    code = str(item.get("offer_code") or "").upper()
    if code.startswith("WORKSPACE"):
        return "Subscription"
    if code.startswith("EVENT"):
        return "Event plan"
    if code.startswith("VENUE"):
        return "Venue"
    if code.startswith("CAPACITY") or "ADDON" in code or "ADD_ON" in code:
        return "Add-on"
    return str(item.get("badge") or "Plan")


def _draw_items_table(canvas, snapshot: dict[str, Any], width: float, height: float) -> list[dict[str, Any]]:
    from reportlab.lib.colors import HexColor

    all_items = list(snapshot.get("items") or [])
    items = all_items[:3]
    remaining = all_items[3:]
    x = 24
    y_top = height - 309
    table_width = width - 48
    header_h = 24
    row_h = 45
    columns = [28, 118, 158, 78, 32, 64, 69]
    headers = ["#", "Item / Plan", "Description", "Period", "Qty", "Unit Price", "Amount"]
    canvas.setFillColor(HexColor(NAVY))
    canvas.roundRect(x, y_top - header_h, table_width, header_h, 5, fill=1, stroke=0)
    cursor = x
    for index, (header, col_width) in enumerate(zip(headers, columns)):
        canvas.setFillColor(HexColor(WHITE)); canvas.setFont("Poppins-SemiBold", 6.6)
        if index >= 4:
            canvas.drawCentredString(cursor + col_width / 2, y_top - 15, header)
        else:
            canvas.drawString(cursor + 6, y_top - 15, header)
        cursor += col_width
    for row_index, item in enumerate(items, start=1):
        row_y = y_top - header_h - row_h * row_index
        canvas.setFillColor(HexColor(WHITE if row_index % 2 else LAVENDER_2))
        canvas.rect(x, row_y, table_width, row_h, fill=1, stroke=0)
        canvas.setStrokeColor(HexColor(LINE)); canvas.setLineWidth(0.45)
        canvas.line(x, row_y, x + table_width, row_y)
        cursor = x
        for col_width in columns:
            canvas.line(cursor, row_y, cursor, row_y + row_h)
            cursor += col_width
        canvas.line(x + table_width, row_y, x + table_width, row_y + row_h)
        canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins", 7)
        canvas.drawCentredString(x + columns[0] / 2, row_y + 19, str(row_index))
        name_x = x + columns[0] + 6
        _draw_lines(canvas, _wrapped_lines(canvas, item.get("name") or item.get("description") or "Invoice item", "Poppins-SemiBold", 7, columns[1] - 12, max_lines=2), name_x, row_y + 32, font="Poppins-SemiBold", size=7, leading=9)
        _round_rect(canvas, name_x, row_y + 5, 53, 12, 5, fill=LAVENDER)
        canvas.setFillColor(HexColor(VIOLET)); canvas.setFont("Poppins-SemiBold", 5.8)
        canvas.drawCentredString(name_x + 26.5, row_y + 8, _fit(_item_badge(item), 15))
        desc_x = x + columns[0] + columns[1] + 7
        _draw_lines(canvas, _wrapped_lines(canvas, item.get("description") or item.get("name") or "Invoice item", "Poppins", 6.4, columns[2] - 14, max_lines=3), desc_x, row_y + 32, size=6.4, leading=8)
        period_x = desc_x + columns[2]
        _draw_lines(canvas, _wrapped_lines(canvas, item.get("period") or "As contracted", "Poppins", 6.3, columns[3] - 14, max_lines=3), period_x, row_y + 32, size=6.3, leading=8)
        qty = int(item.get("quantity") or 1)
        unit_price = item.get("unit_price")
        amount = _decimal(item.get("amount"))
        if unit_price is None:
            unit_price = amount / max(qty, 1)
        starts = [sum(columns[:4]), sum(columns[:5]), sum(columns[:6])]
        canvas.setFont("Poppins", 6.6); canvas.setFillColor(HexColor(INK))
        canvas.drawCentredString(x + starts[0] + columns[4] / 2, row_y + 20, str(qty))
        canvas.drawRightString(x + starts[1] + columns[5] - 6, row_y + 20, _money(unit_price, str(snapshot.get("currency") or "INR")))
        canvas.setFont("Poppins-SemiBold", 6.8)
        canvas.drawRightString(x + starts[2] + columns[6] - 6, row_y + 20, _money(amount, str(snapshot.get("currency") or "INR")))
    bottom = y_top - header_h - row_h * max(3, len(items))
    canvas.setStrokeColor(HexColor(LINE)); canvas.roundRect(x, bottom, table_width, header_h + row_h * max(3, len(items)), 5, fill=0, stroke=1)
    if remaining:
        canvas.setFillColor(HexColor(MUTED)); canvas.setFont("Poppins", 6)
        canvas.drawRightString(width - 28, bottom - 9, f"{len(remaining)} additional item(s) continue on the following page(s).")
    return remaining


def _draw_summary_and_totals(canvas, snapshot: dict[str, Any], width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    y = height - 592
    left_w = 278
    right_x = 317
    right_w = width - right_x - 24
    _round_rect(canvas, 24, y, left_w, 108, 7, fill=WHITE, stroke=LINE)
    canvas.setFillColor(HexColor(VIOLET)); canvas.setFont("Poppins-Bold", 12)
    canvas.drawString(38, y + 88, "≋")
    canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins-SemiBold", 10)
    canvas.drawString(58, y + 88, "Plan Summary")
    summary = list(snapshot.get("plan_summary") or [])[:6]
    if not summary:
        summary = [{"label": "Billed items", "value": str(len(snapshot.get("items") or []))}]
    cursor_y = y + 69
    for row in summary:
        canvas.setStrokeColor(HexColor("#EEF0F6")); canvas.line(38, cursor_y - 4, 288, cursor_y - 4)
        canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins", 6.6)
        canvas.drawString(45, cursor_y, _fit(row.get("label") or "Plan", 36))
        canvas.setFont("Poppins-SemiBold", 6.6)
        canvas.drawRightString(286, cursor_y, _fit(row.get("value") or "Included", 28))
        cursor_y -= 13

    _round_rect(canvas, right_x, y, right_w, 108, 7, fill=WHITE, stroke=LINE)
    subtotal = _decimal(snapshot.get("amount"))
    gst = _decimal(snapshot.get("gst_amount"))
    total = _decimal(snapshot.get("total_amount"), str(subtotal + gst))
    for row_y, label, amount, bold in (
        (y + 83, "Subtotal", subtotal, False),
        (y + 59, str(snapshot.get("tax_label") or "GST (18%)"), gst, False),
    ):
        canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins-SemiBold" if bold else "Poppins", 8)
        canvas.drawString(right_x + 14, row_y, label)
        canvas.setFont("Poppins-SemiBold", 8)
        canvas.drawRightString(right_x + right_w - 14, row_y, _money(amount, str(snapshot.get("currency") or "INR")))
        canvas.setStrokeColor(HexColor(LINE)); canvas.line(right_x + 12, row_y - 9, right_x + right_w - 12, row_y - 9)
    _round_rect(canvas, right_x + 8, y + 8, right_w - 16, 32, 5, fill=VIOLET)
    canvas.setFillColor(HexColor(WHITE)); canvas.setFont("Poppins-SemiBold", 11)
    canvas.drawString(right_x + 21, y + 19, "Total Amount")
    canvas.setFont("Poppins-Bold", 12)
    canvas.drawRightString(right_x + right_w - 20, y + 19, _money(total, str(snapshot.get("currency") or "INR")))


def _draw_payment_notes_signature(canvas, snapshot: dict[str, Any], signature: dict[str, Any], width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    y_top = height - 612
    canvas.setStrokeColor(HexColor(LINE)); canvas.line(32, y_top, width - 32, y_top)
    left_x = 32
    right_x = width / 2 + 14
    canvas.setFillColor(HexColor(VIOLET)); canvas.setFont("Poppins-Bold", 10)
    canvas.drawString(left_x, y_top - 21, "Payment Details")
    canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins", 6.8)
    payment_rows = [
        ("Payment Status", str(snapshot.get("status") or "UNPAID").title()),
        ("Paid On", _date(snapshot.get("paid_at")) if snapshot.get("paid_at") else "Not paid"),
        ("Mode", str(snapshot.get("payment_mode") or "Online payment")),
        ("Transaction ID", str(snapshot.get("payment_reference") or "Not recorded")),
    ]
    for index, (label, value) in enumerate(payment_rows):
        y = y_top - 41 - index * 14
        canvas.drawString(left_x + 14, y, label)
        canvas.drawString(left_x + 92, y, ":")
        if label == "Payment Status" and value.lower() == "paid":
            _round_rect(canvas, left_x + 105, y - 4, 38, 14, 4, fill=GREEN_SOFT)
            canvas.setFillColor(HexColor(GREEN)); canvas.setFont("Poppins-SemiBold", 6.5)
            canvas.drawCentredString(left_x + 124, y, value)
            canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins", 6.8)
        else:
            canvas.drawString(left_x + 105, y, _fit(value, 36))

    canvas.setFillColor(HexColor(VIOLET)); canvas.setFont("Poppins-Bold", 10)
    canvas.drawString(right_x, y_top - 21, "Notes")
    notes = list(snapshot.get("notes") or [])[:3] or [
        "This is a system-generated invoice and does not require a physical signature.",
        "Plans, add-ons and licences apply only for the stated period.",
        "Additional terms are governed by the EventOS Terms of Service.",
    ]
    for index, note in enumerate(notes):
        y = y_top - 40 - index * 13
        canvas.setFillColor(HexColor(VIOLET)); canvas.circle(right_x + 3, y + 2, 1.3, fill=1, stroke=0)
        _draw_lines(canvas, _wrapped_lines(canvas, note, "Poppins", 5.9, width - right_x - 44, max_lines=1), right_x + 12, y, size=5.9, color=INK)

    seal_y = y_top - 126
    seal_fill = GREEN_SOFT if signature.get("cryptographic") else LAVENDER
    _round_rect(canvas, right_x, seal_y, width - right_x - 32, 42, 7, fill=seal_fill, stroke=LINE)
    canvas.setStrokeColor(HexColor(GREEN if signature.get("cryptographic") else VIOLET))
    canvas.setLineWidth(1.2); canvas.circle(right_x + 22, seal_y + 21, 12, fill=0, stroke=1)
    _draw_checkmark(
        canvas,
        right_x + 17,
        seal_y + 17,
        color=GREEN if signature.get("cryptographic") else VIOLET,
        scale=1.05,
    )
    canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins-SemiBold", 7)
    canvas.drawString(right_x + 42, seal_y + 27, "Digitally signed" if signature.get("cryptographic") else "System seal")
    canvas.setFont("Poppins", 5.7)
    canvas.drawString(right_x + 42, seal_y + 16, _fit(signature.get("signer") or "EventOS IT Solutions", 34))
    canvas.drawString(right_x + 42, seal_y + 7, f"Ref: {_fit(signature.get('reference') or '', 28)}")


def _draw_footer(canvas, snapshot: dict[str, Any], width: float, y: float = 34) -> None:
    from reportlab.lib.colors import HexColor

    issuer = snapshot.get("issuer") or {}
    canvas.setStrokeColor(HexColor(LINE)); canvas.line(32, y + 22, width - 32, y + 22)
    values = [
        f"◉  {issuer.get('website') or 'www.eventos.com'}",
        f"✉  {issuer.get('email') or 'billing@eventos.com'}",
        f"☎  {issuer.get('phone') or '+91 11 4703 8800'}",
        f"⌖  {_fit(issuer.get('address') or 'Delhi, India', 30)}",
    ]
    positions = [38, 174, 330, 455]
    canvas.setFont("Poppins", 5.8); canvas.setFillColor(HexColor(INK))
    for position, value in zip(positions, values):
        canvas.drawString(position, y, value)


def _draw_continuation_page(canvas, snapshot: dict[str, Any], items: list[dict[str, Any]], page_number: int, total_pages: int, width: float, height: float) -> None:
    from reportlab.lib.colors import HexColor

    _draw_brand_header(canvas, width, height)
    canvas.setFillColor(HexColor(NAVY)); canvas.setFont("Poppins-Bold", 20)
    canvas.drawString(32, height - 112, "Invoice item continuation")
    canvas.setFont("Poppins", 8)
    canvas.drawRightString(width - 32, height - 108, f"{snapshot.get('invoice_number') or 'Invoice'}  •  Page {page_number} of {total_pages}")
    y = height - 145
    x = 32
    columns = [28, 150, 212, 40, 64, 69]
    headers = ["#", "Item / Plan", "Description / Period", "Qty", "Unit Price", "Amount"]
    canvas.setFillColor(HexColor(NAVY)); canvas.roundRect(x, y - 24, width - 64, 24, 5, fill=1, stroke=0)
    cursor = x
    for index, (header, col_width) in enumerate(zip(headers, columns)):
        canvas.setFillColor(HexColor(WHITE)); canvas.setFont("Poppins-SemiBold", 6.5)
        canvas.drawString(cursor + 6, y - 15, header)
        cursor += col_width
    row_h = 52
    for index, item in enumerate(items):
        row_y = y - 24 - row_h * (index + 1)
        canvas.setFillColor(HexColor(WHITE if index % 2 == 0 else LAVENDER_2)); canvas.rect(x, row_y, width - 64, row_h, fill=1, stroke=0)
        canvas.setStrokeColor(HexColor(LINE)); canvas.line(x, row_y, width - 32, row_y)
        canvas.setFillColor(HexColor(INK)); canvas.setFont("Poppins", 7)
        canvas.drawCentredString(x + 14, row_y + 23, str(4 + (page_number - 2) * 10 + index))
        _draw_lines(canvas, _wrapped_lines(canvas, item.get("name") or item.get("description"), "Poppins-SemiBold", 7, 138, max_lines=2), x + 36, row_y + 35, font="Poppins-SemiBold", size=7, leading=9)
        details = f"{item.get('description') or ''}  |  {item.get('period') or 'As contracted'}"
        _draw_lines(canvas, _wrapped_lines(canvas, details, "Poppins", 6.3, 198, max_lines=3), x + 186, row_y + 35, size=6.3, leading=8)
        quantity = int(item.get("quantity") or 1)
        amount = _decimal(item.get("amount"))
        unit_price = _decimal(item.get("unit_price"), str(amount / max(quantity, 1)))
        canvas.setFont("Poppins", 6.5)
        canvas.drawCentredString(x + 398 + 20, row_y + 23, str(quantity))
        canvas.drawRightString(x + 462 + 58, row_y + 23, _money(unit_price, str(snapshot.get("currency") or "INR")))
        canvas.setFont("Poppins-SemiBold", 6.5)
        canvas.drawRightString(width - 38, row_y + 23, _money(amount, str(snapshot.get("currency") or "INR")))
    _draw_footer(canvas, snapshot, width)


def _load_signer(config: InvoicePdfSigningConfig):
    if not config.pkcs12_path:
        if config.required:
            raise RuntimeError("Cryptographic invoice signing is required but INVOICE_SIGNING_PKCS12_PATH is empty")
        return None
    certificate_path = Path(config.pkcs12_path).expanduser().resolve()
    if not certificate_path.is_file():
        raise RuntimeError(f"Invoice signing certificate was not found at {certificate_path}")
    from pyhanko.sign import signers

    signer = signers.SimpleSigner.load_pkcs12(
        str(certificate_path),
        passphrase=config.pkcs12_password.encode("utf-8") if config.pkcs12_password else None,
    )
    if signer is None:
        raise RuntimeError("Invoice signing certificate could not be loaded")
    return signer


def _signature_identity(signer: Any, config: InvoicePdfSigningConfig, reference: str) -> dict[str, Any]:
    if signer is None:
        return {"cryptographic": False, "signer": config.signer_name, "reference": reference}
    subject = getattr(getattr(signer, "signing_cert", None), "subject", None)
    native = getattr(subject, "native", {}) or {}
    signer_name = native.get("common_name") or native.get("organization_name") or config.signer_name
    serial = getattr(getattr(signer, "signing_cert", None), "serial_number", None)
    suffix = f"-{str(serial)[-8:]}" if serial is not None else ""
    return {
        "cryptographic": True,
        "signer": str(signer_name),
        "reference": f"{reference}{suffix}",
    }


def _render_unsigned_invoice(snapshot: dict[str, Any], signature: dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as canvas_module

    _register_fonts()
    buffer = io.BytesIO()
    width, height = A4
    canvas = canvas_module.Canvas(buffer, pagesize=A4, pageCompression=1)
    canvas.setTitle(str(snapshot.get("invoice_number") or "EventOS invoice"))
    canvas.setAuthor(str((snapshot.get("issuer") or {}).get("name") or "EventOS IT Solutions"))
    canvas.setSubject("EventOS tax invoice")
    canvas.setCreator("EventOS Invoice Service")

    _draw_brand_header(canvas, width, height)
    _draw_invoice_title(canvas, snapshot, width, height)
    _draw_party_columns(canvas, snapshot, width, height)
    _draw_meta_strip(canvas, snapshot, width, height)
    remaining = _draw_items_table(canvas, snapshot, width, height)
    _draw_summary_and_totals(canvas, snapshot, width, height)
    _draw_payment_notes_signature(canvas, snapshot, signature, width, height)
    _draw_footer(canvas, snapshot, width)

    if remaining:
        chunks = [remaining[index : index + 10] for index in range(0, len(remaining), 10)]
        total_pages = 1 + len(chunks)
        for index, chunk in enumerate(chunks, start=2):
            canvas.showPage()
            _draw_continuation_page(canvas, snapshot, chunk, index, total_pages, width, height)
    canvas.save()
    return buffer.getvalue()


def _sign_pdf(unsigned_pdf: bytes, signer: Any, config: InvoicePdfSigningConfig) -> bytes:
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import fields, signers

    writer = IncrementalPdfFileWriter(io.BytesIO(unsigned_pdf))
    timestamper = None
    if config.tsa_url:
        from pyhanko.sign.timestamps.requests_client import HTTPTimeStamper

        timestamper = HTTPTimeStamper(config.tsa_url)
    output = signers.sign_pdf(
        writer,
        signature_meta=signers.PdfSignatureMetadata(
            field_name="EventOSInvoiceSignature",
            md_algorithm="sha256",
            reason=config.reason,
            location=config.location,
        ),
        signer=signer,
        timestamper=timestamper,
        new_field_spec=fields.SigFieldSpec(
            sig_field_name="EventOSInvoiceSignature",
            on_page=-1,
            box=(0, 0, 0, 0),
        ),
    )
    return output.getvalue()


def render_invoice_pdf(
    snapshot: dict[str, Any],
    *,
    signing_config: InvoicePdfSigningConfig | None = None,
) -> bytes:
    """Render and optionally cryptographically sign a version-bound invoice."""

    if not snapshot.get("invoice_number"):
        raise ValueError("invoice_number is required")
    if not snapshot.get("buyer") or not snapshot.get("issuer"):
        raise ValueError("buyer and issuer invoice identities are required")
    config = signing_config or InvoicePdfSigningConfig()
    signer = _load_signer(config)
    reference = _canonical_reference(snapshot)
    signature = _signature_identity(signer, config, reference)
    unsigned = _render_unsigned_invoice(snapshot, signature)
    if signer is None:
        return unsigned
    return _sign_pdf(unsigned, signer, config)


def signing_status(pdf_bytes: bytes) -> dict[str, Any]:
    """Return a bounded signature inventory for diagnostics and tests."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    fields = reader.get_fields() or {}
    signature_fields = [
        name for name, field in fields.items() if str(field.get("/FT")) == "/Sig"
    ]
    return {
        "page_count": len(reader.pages),
        "signature_fields": signature_fields,
        "is_cryptographically_signed": bool(signature_fields),
    }

