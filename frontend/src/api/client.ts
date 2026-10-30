import createClient from "openapi-fetch";
import { supabase } from "../lib/supabase";
import type { paths } from "./schema";

/**
 * Typed API client. Paths, params and responses come from backend/openapi.json
 * (regenerate with `npm run gen:api`), so a backend change breaks the build here, not the demo.
 */
export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
});

// Attach the Supabase access token to every request when someone is logged in.
api.use({
  async onRequest({ request }) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
});
