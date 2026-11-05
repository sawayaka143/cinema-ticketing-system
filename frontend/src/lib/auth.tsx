import { type ReactNode, useEffect, useState } from "react";
import { type Auth, AuthContext } from "./auth-context";
import { supabase } from "./supabase";

/** Keeps the Supabase login session in React state. Read it with `useAuth()`. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth>({ session: null, ready: false });

  useEffect(() => {
    // Fires once with the stored session (INITIAL_SESSION), then on every login/logout.
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setAuth({ session, ready: true }),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
