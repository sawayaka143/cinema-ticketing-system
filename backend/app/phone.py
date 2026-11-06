"""Phone numbers: normalize to +7XXXXXXXXXX before saving (docs/schema-decisions.md §7).

Accepted: "+7 701 123-45-67", "8 (701) 123 45 67", "+7(701)1234567" and so on.
Spaces, dashes and brackets are removed; a leading 8 becomes +7.
"""

import re

SEPARATORS = re.compile(r"[\s\-()]")
NORMALIZED = re.compile(r"^\+7[0-9]{10}$")


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str) -> str:
    """The number as +7XXXXXXXXXX. Raises InvalidPhone with a message for the user."""
    phone = SEPARATORS.sub("", raw)
    if phone.startswith("8") and len(phone) == 11:
        phone = "+7" + phone[1:]
    if not NORMALIZED.match(phone):
        raise InvalidPhone(
            "Phone must be a Kazakhstan number: +7 and 10 digits, e.g. +7 701 123 45 67"
        )
    return phone
