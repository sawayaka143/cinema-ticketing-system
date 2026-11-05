"""Ticket prices (docs/schema-decisions.md §7)."""

from decimal import ROUND_HALF_UP, Decimal

# Open question in §9: confirm the VIP multiplier.
VIP_MULTIPLIER = Decimal("1.5")
CENT = Decimal("0.01")


def ticket_price(
    base_price: Decimal, seat_type: str, discount_pct: Decimal = Decimal(0)
) -> Decimal:
    """base_price × (1.5 for vip) × (1 − discount_pct / 100), rounded to 2 decimals."""
    multiplier = VIP_MULTIPLIER if seat_type == "vip" else Decimal(1)
    price = base_price * multiplier * (1 - discount_pct / 100)
    return price.quantize(CENT, rounding=ROUND_HALF_UP)
