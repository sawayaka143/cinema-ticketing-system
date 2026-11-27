"""Ticket prices (docs/schema-decisions.md §7)."""

from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

# Open question in §9: confirm the VIP multiplier.
VIP_MULTIPLIER = Decimal("1.5")
CENT = Decimal("0.01")

Bundle = Literal["family", "group"]

# Bundle deals (§7): one extra discount for the whole booking, on top of the ticket types.
FAMILY_MIN_ADULTS = 2  # family: at least 2 adult tickets …
FAMILY_CHILDREN = (1, 4)  # … and 1 to 4 child tickets
GROUP_MIN_SEATS = 6  # group: 6 or more seats (a booking holds at most 10)
BUNDLE_PCT: dict[Bundle, Decimal] = {"family": Decimal(10), "group": Decimal(10)}


def ticket_price(
    base_price: Decimal,
    seat_type: str,
    discount_pct: Decimal = Decimal(0),
    bundle_pct: Decimal = Decimal(0),
) -> Decimal:
    """base × (1.5 for vip) × (1 − discount_pct/100) × (1 − bundle_pct/100), 2 decimals."""
    multiplier = VIP_MULTIPLIER if seat_type == "vip" else Decimal(1)
    price = base_price * multiplier * (1 - discount_pct / 100) * (1 - bundle_pct / 100)
    return price.quantize(CENT, rounding=ROUND_HALF_UP)


def bundle_for(type_names: Sequence[str]) -> Bundle | None:
    """The deal a booking with these ticket types gets, or None.

    Staff tickets count towards the group size but never get the bundle discount
    (they are already −50%). When both deals apply, the bigger discount wins (family on a tie).
    """
    adults = sum(name == "adult" for name in type_names)
    children = sum(name == "child" for name in type_names)
    deals: list[Bundle] = []
    if adults >= FAMILY_MIN_ADULTS and FAMILY_CHILDREN[0] <= children <= FAMILY_CHILDREN[1]:
        deals.append("family")
    if len(type_names) >= GROUP_MIN_SEATS:
        deals.append("group")
    return max(deals, key=lambda deal: BUNDLE_PCT[deal]) if deals else None


def price_before_bundle(price: Decimal, bundle_pct: Decimal) -> Decimal:
    """A ticket's price without the bundle discount, worked back from the price that was sold."""
    return (price / (1 - bundle_pct / 100)).quantize(CENT, rounding=ROUND_HALF_UP)
