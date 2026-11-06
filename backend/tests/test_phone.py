"""normalize_phone: Kazakhstan numbers to +7XXXXXXXXXX (no database needed)."""

import pytest

from app.phone import InvalidPhone, normalize_phone


@pytest.mark.parametrize(
    "raw",
    [
        "+77011234567",
        "+7 701 123 45 67",
        "8 (701) 123-45-67",
        "87011234567",
        "+7(701)123-4567",
    ],
)
def test_valid_numbers_are_normalized(raw: str):
    assert normalize_phone(raw) == "+77011234567"


@pytest.mark.parametrize(
    "raw",
    [
        "8 701 123",  # too short
        "+7701123456789",  # too long
        "+1 202 555 0101",  # not +7
        "7011234567",  # no country code
        "+7 701 ABC 45 67",  # letters
        "",
    ],
)
def test_invalid_numbers_are_rejected(raw: str):
    with pytest.raises(InvalidPhone, match=r"\+7 and 10 digits"):
        normalize_phone(raw)
