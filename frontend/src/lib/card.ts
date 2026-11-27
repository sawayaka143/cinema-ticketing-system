import type { TranslationKey } from "./i18n";

/**
 * Bank card form rules for the simulated payment (the same checks a real checkout makes).
 * Nothing here leaves the browser: the API only ever receives the payment method, never card data.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "mir" | "unionpay" | "unknown";

export interface CardInput {
  number: string; // digits only
  name: string;
  expiry: string; // "MM/YY" as typed
  cvc: string; // digits only
}

export interface CardError {
  key: TranslationKey;
  vars?: Record<string, string | number>;
}

export type CardErrors = Partial<Record<keyof CardInput, CardError>>;

export const EMPTY_CARD: CardInput = { number: "", name: "", expiry: "", cvc: "" };

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  mir: "Mir",
  unionpay: "UnionPay",
  unknown: "Card",
};

/** The payment system, from the first digits (IIN ranges). */
export function cardBrand(digits: string): CardBrand {
  if (/^4/.test(digits)) return "visa";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^220[0-4]/.test(digits)) return "mir";
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return "mastercard";
  if (/^62/.test(digits)) return "unionpay";
  return "unknown";
}

/** Allowed number lengths per brand. */
function numberLengths(brand: CardBrand): number[] {
  if (brand === "amex") return [15];
  if (brand === "unionpay") return [16, 17, 18, 19];
  if (brand === "visa") return [13, 16, 19];
  if (brand === "mir") return [16, 17, 18, 19];
  return [16];
}

export function maxNumberLength(brand: CardBrand) {
  return Math.max(...numberLengths(brand));
}

export function cvcLength(brand: CardBrand) {
  return brand === "amex" ? 4 : 3;
}

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

/** "4242424242424242" → "4242 4242 4242 4242" (Amex: 4-6-5). */
export function formatNumber(digits: string) {
  if (cardBrand(digits) === "amex") {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(" ");
  }
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Typing "1225" or "12/25" gives "12/25"; a lone "4" becomes "04/" so the month is never ambiguous. */
export function formatExpiry(raw: string, previous: string) {
  const digits = onlyDigits(raw).slice(0, 4);
  // Deleting the slash also deletes the digit before it, so backspace never gets stuck.
  if (raw.length < previous.length && previous.endsWith("/") && !raw.includes("/")) return digits.slice(0, 1);
  if (digits.length === 1 && Number(digits) > 1) return `0${digits}/`;
  if (digits.length >= 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

/** The Luhn checksum every real card number passes. */
export function luhnValid(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** Each field's problem, or nothing when the card can be charged. */
export function validateCard(card: CardInput, now = new Date()): CardErrors {
  const errors: CardErrors = {};
  const brand = cardBrand(card.number);

  if (!card.number) errors.number = { key: "card.errNumberRequired" };
  else if (!numberLengths(brand).includes(card.number.length) || !luhnValid(card.number)) {
    errors.number = { key: "card.errNumberInvalid" };
  }

  const name = card.name.trim();
  if (!name) errors.name = { key: "card.errNameRequired" };
  else if (!/^[A-Za-z][A-Za-z .'-]*[A-Za-z]$/.test(name)) errors.name = { key: "card.errNameLatin" };

  const match = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
  if (!card.expiry) errors.expiry = { key: "card.errExpiryRequired" };
  else if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) {
    errors.expiry = { key: "card.errExpiryFormat" };
  } else {
    const year = 2000 + Number(match[2]);
    const month = Number(match[1]);
    const thisMonth = now.getFullYear() * 12 + now.getMonth() + 1;
    const cardMonth = year * 12 + month;
    if (cardMonth < thisMonth) errors.expiry = { key: "card.errExpiryExpired" };
    else if (cardMonth > thisMonth + 20 * 12) errors.expiry = { key: "card.errExpiryYear" };
  }

  const expectedCvc = cvcLength(brand);
  if (!card.cvc) errors.cvc = { key: "card.errCvcRequired" };
  else if (card.cvc.length !== expectedCvc) {
    errors.cvc = { key: "card.errCvcLength", vars: { count: expectedCvc } };
  }

  return errors;
}

/** "•••• 4242" for the card preview and the pay button. */
export function lastFour(digits: string) {
  return digits.length >= 4 ? digits.slice(-4) : "";
}
