import { supabase } from "./supabase";
import { ApiError } from "./useApi";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Sends a poster image to `POST /api/admin/posters` and returns its public URL.
 * The image is the request body itself (no form data), so this uses fetch, not the typed client.
 */
export async function uploadPoster(file: File): Promise<string> {
  if (!TYPES.includes(file.type)) throw new ApiError("Choose a JPEG, PNG or WebP image", 415);
  if (file.size > MAX_BYTES) throw new ApiError("The image is larger than 4 MB", 413);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/api/admin/posters`, {
    method: "POST",
    headers: { "Content-Type": file.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; detail?: unknown };
  if (!res.ok || !body.url) {
    const detail = typeof body.detail === "string" ? body.detail : `Upload failed (${res.status})`;
    throw new ApiError(detail, res.status);
  }
  return body.url;
}
