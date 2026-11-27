import { UserIcon } from "./TabIcons";

export const PRESET_AVATARS = [
  { id: "preset:reel", label: "Film reel" },
  { id: "preset:ticket", label: "Ticket" },
  { id: "preset:star", label: "Star" },
  { id: "preset:popcorn", label: "Popcorn" },
  { id: "preset:mountain", label: "Alatau" },
  { id: "preset:glasses", label: "3D" },
] as const;

export type PresetAvatarId = (typeof PRESET_AVATARS)[number]["id"];

function PresetSvg({ id }: { id: string }) {
  switch (id) {
    case "preset:reel":
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="12" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="17.2" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="6.8" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="17.2" cy="12" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "preset:ticket":
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5v2a1.75 1.75 0 0 0 0 3.5v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16v-2a1.75 1.75 0 0 0 0-3.5z" />
          <path d="M14.5 7v10" strokeDasharray="1.5 2.5" />
        </svg>
      );
    case "preset:star":
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3.5 2.6 5.3 5.9.8-4.2 4.1 1 5.8L12 16.8 6.7 19.5l1-5.8-4.2-4.1 5.9-.8z" />
        </svg>
      );
    case "preset:popcorn":
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6.5 10h11l-1.3 10.5H7.8z" />
          <path d="M10 10v10.5M14 10v10.5" />
          <path d="M7.5 10a2.5 2.5 0 0 1 1.7-4.3 2.8 2.8 0 0 1 5.6 0A2.5 2.5 0 0 1 16.5 10" />
        </svg>
      );
    case "preset:mountain":
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 18.5 9.5 7l4 6.5 2.5-3.5 5 8.5z" />
          <path d="m7.5 11 2 1.2 2-1.2" />
        </svg>
      );
    case "preset:glasses":
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="9" width="7.5" height="6" rx="1.5" />
          <rect x="13.5" y="9" width="7.5" height="6" rx="1.5" />
          <path d="M10.5 12h3" />
        </svg>
      );
    default:
      return <UserIcon />;
  }
}

function initialsOf(name?: string | null, email?: string | null): string | null {
  const src = (name ?? "").trim();
  if (src) {
    const parts = src.split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2)).toUpperCase();
  }
  const e = (email ?? "").trim();
  return e ? e[0].toUpperCase() : null;
}

export function UserAvatar({
  avatarUrl,
  name,
  email,
  size = "md",
  className = "",
}: {
  avatarUrl?: string | null;
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const isPreset = !!avatarUrl && avatarUrl.startsWith("preset:");
  const isImage = !!avatarUrl && !isPreset;
  const initials = initialsOf(name, email);

  return (
    <span className={`user-avatar user-avatar-${size} ${className}`.trim()} aria-hidden="true">
      {isImage ? (
        <img src={avatarUrl} alt="" className="user-avatar-img" />
      ) : isPreset ? (
        <PresetSvg id={avatarUrl} />
      ) : initials ? (
        <span className="user-avatar-initials">{initials}</span>
      ) : (
        <UserIcon />
      )}
    </span>
  );
}

/** Center-crop and resize a user image file to a compact 192x192 WebP/JPEG Blob for upload. */
export async function resizeAvatarBlob(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    throw new Error("Unsupported image type");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image"));
      el.src = url;
    });
    const size = 192;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    const toBlob = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));

    const webp = await toBlob("image/webp");
    if (webp && webp.type === "image/webp" && webp.size < 180_000) {
      return webp;
    }
    const jpeg = await toBlob("image/jpeg");
    if (!jpeg) throw new Error("Could not encode image");
    return jpeg;
  } finally {
    URL.revokeObjectURL(url);
  }
}
