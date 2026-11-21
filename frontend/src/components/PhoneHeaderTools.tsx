import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { BellIcon, GlobeIcon, UserIcon } from "./TabIcons";

const LANGUAGES = [
  { code: "en", short: "EN", name: "English" },
  { code: "ru", short: "RU", name: "Русский" },
  { code: "kk", short: "KZ", name: "Қазақша" },
] as const;
type LangCode = (typeof LANGUAGES)[number]["code"];

function readLang(): LangCode {
  try {
    const stored = localStorage.getItem("lang");
    if (LANGUAGES.some((l) => l.code === stored)) return stored as LangCode;
  } catch {
    // storage blocked: fall back to English
  }
  return "en";
}

/** Close a popover on outside tap or Escape. */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

function LanguagePicker() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<LangCode>(readLang);
  const ref = useDismiss(open, () => setOpen(false));
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  const choose = (code: LangCode) => {
    setLang(code);
    setOpen(false);
    try {
      localStorage.setItem("lang", code);
    } catch {
      // ignore
    }
  };

  return (
    <div className="tool-pop" ref={ref}>
      <button
        type="button"
        className="tool-btn tool-btn-lang"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <GlobeIcon />
        <span>{current.short}</span>
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" className="tool-caret">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <ul className="tool-menu" role="listbox" aria-label="Language">
          {LANGUAGES.map((l) => (
            <li key={l.code} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                className="tool-option"
                onClick={() => choose(l.code)}
              >
                <span>{l.name}</span>
                {l.code === lang && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="tool-pop" ref={ref}>
      <button
        type="button"
        className="tool-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
      </button>
      {open && (
        <div className="tool-menu tool-notes" role="dialog" aria-label="Notifications">
          <p className="tool-notes-title">Notifications</p>
          <p className="tool-notes-empty">You're all caught up.</p>
        </div>
      )}
    </div>
  );
}

/** Phone-only header controls for the storefront: language, and profile (logged out) or bell (logged in). */
export function PhoneHeaderTools({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="phone-tools">
      <LanguagePicker />
      {signedIn ? (
        <Notifications />
      ) : (
        <Link to="/login" className="tool-btn" aria-label="Log in or sign up">
          <UserIcon />
        </Link>
      )}
    </div>
  );
}
