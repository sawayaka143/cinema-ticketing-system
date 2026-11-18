import type { Session } from "@supabase/supabase-js";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { AuthContext } from "./auth-context";
import type { Me } from "./format";
import { supabase } from "./supabase";

/** Keeps the Supabase session and backend /api/me profile in React state. Read via `useAuth()`. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<{ session: Session | null; ready: boolean }>({
    session: null,
    ready: false,
  });
  const [meState, setMeState] = useState<{ userId: string | null; me: Me | null; ready: boolean }>({
    userId: null,
    me: null,
    ready: false,
  });
  const [meTick, setMeTick] = useState(0);

  const refreshMe = useCallback(() => setMeTick((t) => t + 1), []);

  useEffect(() => {
    // Fires once with the stored session (INITIAL_SESSION), then on every login/logout.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionState({ session, ready: true });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = sessionState.session?.user.id ?? null;

  useEffect(() => {
    if (!sessionState.ready || !userId) return;
    let active = true;
    api
      .GET("/api/me")
      .then((res) => {
        if (active) setMeState({ userId, me: res.data ?? null, ready: true });
      })
      .catch(() => {
        if (active) setMeState({ userId, me: null, ready: true });
      });
    return () => {
      active = false;
    };
  }, [sessionState.ready, userId, meTick]);

  const meReady = sessionState.ready ? (userId ? meState.userId === userId && meState.ready : true) : false;
  const me = userId && meState.userId === userId ? meState.me : null;

  return (
    <AuthContext.Provider
      value={{
        session: sessionState.session,
        ready: sessionState.ready,
        me,
        meReady,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
