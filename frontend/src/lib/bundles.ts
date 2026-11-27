import type { TranslationKey } from "./i18n";

/**
 * Family and group deals, mirrored from backend/app/pricing.py (docs/schema-decisions.md §7)
 * so the seat picker can show them before the hold. The API applies the real price.
 */

export type Bundle = "family" | "group";

export const BUNDLE_PCT: Record<Bundle, number> = { family: 10, group: 10 };
const FAMILY_MIN_ADULTS = 2;
const FAMILY_CHILDREN = [1, 4] as const;
const GROUP_MIN_SEATS = 6;
const MAX_SEATS = 10;

export const BUNDLE_LABEL_KEY: Record<Bundle, TranslationKey> = {
  family: "bundle.family",
  group: "bundle.group",
};

export interface BundleItem {
  /** The seat's list price (VIP included), before the ticket type. */
  seatPrice: number;
  type: string;
  discountPct: number;
  staffOnly: boolean;
}

/** The deal a booking with these ticket types gets (same rule as the API). */
export function bundleFor(types: string[]): Bundle | null {
  const adults = types.filter((t) => t === "adult").length;
  const children = types.filter((t) => t === "child").length;
  const deals: Bundle[] = [];
  if (adults >= FAMILY_MIN_ADULTS && children >= FAMILY_CHILDREN[0] && children <= FAMILY_CHILDREN[1]) {
    deals.push("family");
  }
  if (types.length >= GROUP_MIN_SEATS) deals.push("group");
  return deals.reduce<Bundle | null>((best, d) => (!best || BUNDLE_PCT[d] > BUNDLE_PCT[best] ? d : best), null);
}

/** Estimated saving from the active bundle deal (staff tickets keep their own price). */
export function bundleSaving(items: BundleItem[], bundle: Bundle | null): number {
  if (!bundle) return 0;
  const pct = BUNDLE_PCT[bundle];
  return items
    .filter((i) => !i.staffOnly)
    .reduce((sum, i) => sum + Math.round(i.seatPrice * (1 - i.discountPct / 100) * (pct / 100)), 0);
}

/** One short tip that gets the customer closer to a deal, or null when none is near. */
export function bundleNudge(
  types: string[],
  childAllowed: boolean,
): { key: TranslationKey; vars?: Record<string, string | number> } | null {
  if (bundleFor(types)) return null;
  const adults = types.filter((t) => t === "adult").length;
  const children = types.filter((t) => t === "child").length;
  const seats = types.length;
  if (childAllowed && children >= 1 && children <= FAMILY_CHILDREN[1] && adults === FAMILY_MIN_ADULTS - 1) {
    return { key: "bundle.nudgeAddAdult" };
  }
  if (childAllowed && adults >= FAMILY_MIN_ADULTS && children === 0 && seats < MAX_SEATS) {
    return { key: "bundle.nudgeAddChild" };
  }
  if (seats >= 3 && seats < GROUP_MIN_SEATS) {
    const more = GROUP_MIN_SEATS - seats;
    return {
      key: more === 1 ? "bundle.nudgeAddSeatsOne" : "bundle.nudgeAddSeatsMany",
      vars: { count: more },
    };
  }
  return null;
}
