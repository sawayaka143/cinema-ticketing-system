import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export type Auth = { session: Session | null; ready: boolean };

export const AuthContext = createContext<Auth>({ session: null, ready: false });

export function useAuth() {
  return useContext(AuthContext);
}
