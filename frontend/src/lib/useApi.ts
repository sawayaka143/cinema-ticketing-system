import { useCallback, useEffect, useEffectEvent, useState } from "react";

export type LoadableState<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

export type Loadable<T> = LoadableState<T> & {
  reload: () => void;
};

/** Responses kept while the tab is open, so a page seen before paints at once on the next visit. */
const cache = new Map<string, unknown>();

/** Stores data another request already returned under the `cacheKey` a later page will ask for. */
export function primeCache<T>(cacheKey: string, data: T) {
  cache.set(cacheKey, data);
}

/**
 * Runs `load` whenever `key` changes or `reload()` is called, tracking loading / error / ready.
 *
 * With a `cacheKey`, the last known data is shown at once and refreshed in the background.
 * Use it for catalog data only; seat maps and bookings must always come from the network.
 */
export function useApi<T>(
  load: () => Promise<T>,
  key: string | number,
  cacheKey?: string,
): Loadable<T> {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const requestKey = `${key}:${tick}`;
  const [result, setResult] = useState<{ key: string; value: LoadableState<T> } | null>(null);
  const run = useEffectEvent(load);

  useEffect(() => {
    let live = true;
    run()
      .then((data) => {
        if (cacheKey) cache.set(cacheKey, data);
        if (live) setResult({ key: requestKey, value: { state: "ready", data } });
      })
      .catch((err: unknown) => {
        // A failed background refresh keeps the cached data on screen.
        if (!live || (cacheKey && cache.has(cacheKey))) return;
        const message = err instanceof Error ? err.message : String(err);
        setResult({ key: requestKey, value: { state: "error", message } });
      });
    return () => {
      live = false;
    };
  }, [requestKey, cacheKey]);

  const current: LoadableState<T> =
    result?.key === requestKey
      ? result.value
      : cacheKey && cache.has(cacheKey)
        ? { state: "ready", data: cache.get(cacheKey) as T }
        : { state: "loading" };
  return { ...current, reload };
}

/** A failed API call. `status` lets pages react to 402 / 409 instead of only showing text. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Unwraps an openapi-fetch result: returns data or throws a readable ApiError. */
export function must<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.data === undefined) {
    const detail = (res.error as { detail?: unknown } | undefined)?.detail;
    const status = res.response.status;
    throw new ApiError(typeof detail === "string" ? detail : `Request failed (${status})`, status);
  }
  return res.data;
}

/** The status of an error thrown by `must`, or 0 for network and other errors. */
export function statusOf(err: unknown) {
  return err instanceof ApiError ? err.status : 0;
}

export function messageOf(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}
