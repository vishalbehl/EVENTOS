"""Tax authority for the India-only Phase 1 commercial model."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


class CommercialTaxService:
    """Calculate GST consistently for previews, invoices, and amendments."""

    GST_RATE = Decimal("18")

    @staticmethod
    def money(value: Decimal | int | float) -> Decimal:
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @classmethod
    def calculate(
        cls,
        subtotal: Decimal | int | float,
        *,
        rate: Decimal | int | float | None = None,
    ) -> tuple[Decimal, Decimal, Decimal]:
        taxable = cls.money(subtotal)
        tax_rate = cls.money(cls.GST_RATE if rate is None else rate)
        tax = cls.money(taxable * tax_rate / Decimal("100"))
        return tax_rate, tax, cls.money(taxable + tax)
