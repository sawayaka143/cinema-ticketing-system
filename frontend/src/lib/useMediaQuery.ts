import { useSyncExternalStore } from "react";

/** Subscribes to a CSS media query; false when matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches the phone breakpoint used across index.css (40rem). */
export const PHONE_QUERY = "(max-width: 40rem)";
