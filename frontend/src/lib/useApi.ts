import { useCallback, useEffect, useEffectEvent, useState } from "react";

export type LoadableState<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

export type Loadable<T> = LoadableState<T> & {
  reload: () => void;
};

/** Runs `load` whenever `key` changes or `reload()` is called, and tracks loading / error / ready with in-memory caching. */
export function useApi<T>(load: () => Promise<T>, key: string | number): Loadable<T> {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [cache, setCache] = useState<
    Record<string | number, { tick: number; value: LoadableState<T> }>
  >({});
  const run = useEffectEvent(load);

  useEffect(() => {
    let live = true;
    run()
      .then((data) => {
        if (live) {
          setCache((prev) => ({
            ...prev,
            [key]: { tick, value: { state: "ready" as const, data } },
          }));
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (live) {
          setCache((prev) => ({
            ...prev,
            [key]: { tick, value: { state: "error" as const, message } },
          }));
        }
      });
    return () => {
      live = false;
    };
  }, [key, tick]);

  const entry = cache[key];
  const current: LoadableState<T> =
    entry && entry.tick === tick ? entry.value : { state: "loading" };
  return { ...current, reload };
}

/** Unwraps an openapi-fetch result: returns data or throws a readable error. */
export function must<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.data === undefined) {
    const detail = (res.error as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.response.status})`);
  }
  return res.data;
}
