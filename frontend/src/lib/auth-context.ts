import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";
import type { Me } from "./format";

export type Auth = {
  session: Session | null;
  ready: boolean;
  me: Me | null;
  meReady: boolean;
  refreshMe: () => void;
};

export const AuthContext = createContext<Auth>({
  session: null,
  ready: false,
  me: null,
  meReady: false,
  refreshMe: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
