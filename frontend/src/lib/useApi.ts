import { useCallback, useEffect, useEffectEvent, useState } from "react";

export type LoadableState<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

export type Loadable<T> = LoadableState<T> & {
  reload: () => void;
};

/** Runs `load` whenever `key` changes or `reload()` is called, tracking loading / error / ready. */
export function useApi<T>(load: () => Promise<T>, key: string | number): Loadable<T> {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const requestKey = `${key}:${tick}`;
  const [result, setResult] = useState<{ key: string; value: LoadableState<T> } | null>(null);
  const run = useEffectEvent(load);

  useEffect(() => {
    let live = true;
    run()
      .then((data) => live && setResult({ key: requestKey, value: { state: "ready", data } }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (live) setResult({ key: requestKey, value: { state: "error", message } });
      });
    return () => {
      live = false;
    };
  }, [requestKey]);

  const current: LoadableState<T> =
    result?.key === requestKey ? result.value : { state: "loading" };
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
