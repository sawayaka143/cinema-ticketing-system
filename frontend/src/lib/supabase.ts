import { createClient } from "@supabase/supabase-js";

/**
 * Supabase is used for login only. All data goes through the API (src/api/client.ts).
 * The anon key is public by design; the database blocks table access for it (RLS, no policies).
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "https://example.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key",
);
