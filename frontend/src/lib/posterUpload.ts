import { supabase } from "./supabase";
import { ApiError } from "./useApi";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const POSTER_MAX_BYTES = 4 * 1024 * 1024;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

async function uploadImage(
  endpoint: string,
  file: Blob,
  contentType: string,
  maxBytes: number,
  maxLabel: string,
): Promise<string> {
  if (!TYPES.includes(contentType)) throw new ApiError("Choose a JPEG, PNG or WebP image", 415);
  if (file.size > maxBytes) throw new ApiError(`The image is larger than ${maxLabel}`, 413);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": contentType, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; detail?: unknown };
  if (!res.ok || !body.url) {
    const detail = typeof body.detail === "string" ? body.detail : `Upload failed (${res.status})`;
    throw new ApiError(detail, res.status);
  }
  return body.url;
}

/**
 * Sends a poster image to `POST /api/admin/posters` and returns its public URL.
 * The image is the request body itself (no form data), so this uses fetch, not the typed client.
 */
export function uploadPoster(file: File): Promise<string> {
  return uploadImage("/api/admin/posters", file, file.type, POSTER_MAX_BYTES, "4 MB");
}

/** Sends a resized avatar image to `POST /api/me/avatar` and returns its public URL. */
export function uploadAvatar(file: Blob): Promise<string> {
  return uploadImage("/api/me/avatar", file, file.type, AVATAR_MAX_BYTES, "2 MB");
}
