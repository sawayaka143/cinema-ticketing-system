import { useEffect, useState } from "react";

/** Seconds left, ticking once a second. Based on the API's seconds_left, so the device clock doesn't matter. */
export function useCountdown(seconds: number) {
  const [deadline] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
