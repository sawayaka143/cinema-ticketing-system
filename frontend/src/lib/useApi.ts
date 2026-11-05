import { useEffect, useEffectEvent, useState } from "react";

export type Loadable<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

/** Runs `load` whenever `key` changes and tracks loading / error / ready for that key. */
export function useApi<T>(load: () => Promise<T>, key: string | number): Loadable<T> {
  const [result, setResult] = useState<{ key: string | number; value: Loadable<T> } | null>(null);
  const run = useEffectEvent(load);

  useEffect(() => {
    let live = true;
    run()
      .then((data) => live && setResult({ key, value: { state: "ready", data } }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (live) setResult({ key, value: { state: "error", message } });
      });
    return () => {
      live = false;
    };
  }, [key]);

  return result?.key === key ? result.value : { state: "loading" };
}

/** Unwraps an openapi-fetch result: returns data or throws a readable error. */
export function must<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.data === undefined) {
    const detail = (res.error as { detail?: unknown } | undefined)?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.response.status})`);
  }
  return res.data;
}
