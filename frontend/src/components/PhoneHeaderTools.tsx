import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../lib/auth-context";
import { LANGUAGES, type LangCode, useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { GlobeIcon, MoonIcon, SettingsIcon, SunIcon, UserIcon } from "./TabIcons";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { UserAvatar } from "./UserAvatar";

/** Top-right Profile icon + unified dropdown menu (Language, Theme, Settings, Auth) on desktop & mobile. */
export function ProfileMenu() {
  const { session, ready, me } = useAuth();
  const { lang, setLang, t } = useI18n();
  const { mode, setMode } = useTheme();
  const location = useLocation();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const ref = useRef<HTMLDivElement>(null);

  const staffRole = me?.staff?.role ?? null;
  const displayName = me?.customer?.full_name || me?.staff?.full_name || null;
  const email = session?.user.email ?? null;
  const city = me?.customer?.city ?? null;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAt(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpenAt(null);

  const chooseLang = (code: LangCode) => {
    setLang(code);
  };

  return (
    <div className="rail-end-controls">
      {ready && !session && (
        <Button as={Link} to="/login" variant="outline" size="sm" className="rail-login-btn">
          {t("nav.login")}
        </Button>
      )}
      <div className="profile-menu-wrap" ref={ref}>
        <button
          type="button"
          className={`profile-trigger${open ? " profile-trigger-open" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="profile-dropdown"
          aria-label={t("nav.profile")}
          onClick={() => setOpenAt(open ? null : location.pathname)}
        >
          {ready && session ? (
            <UserAvatar
              avatarUrl={me?.customer?.avatar_url}
              name={displayName}
              email={email}
              size="sm"
            />
          ) : (
            <span className="profile-trigger-icon">
              <UserIcon />
            </span>
          )}
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" className="tool-caret">
            <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {open && (
          <>
            <div className="profile-backdrop" aria-hidden="true" onClick={close} />
            <div
              id="profile-dropdown"
              className="profile-dropdown"
              role="dialog"
              aria-label={t("nav.profile")}
            >
          {ready && session ? (
            <div className="profile-dropdown-header">
              <UserAvatar
                avatarUrl={me?.customer?.avatar_url}
                name={displayName}
                email={email}
                size="md"
              />
              <div className="profile-dropdown-identity">
                {displayName && <p className="profile-dropdown-name">{displayName}</p>}
                {email && <p className="profile-dropdown-email">{email}</p>}
                <div className="profile-dropdown-tags">
                  {city && <span className="profile-dropdown-city">{city}</span>}
                  {staffRole && (
                    <Badge tone="accent" variant="subtle" className="cap">
                      {staffRole}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="profile-dropdown-guest">
              <Button as={Link} to="/login" variant="solid" size="md" onClick={close}>
                {t("nav.login")}
              </Button>
            </div>
          )}

          <div className="profile-dropdown-divider" role="separator" />

          <div className="profile-dropdown-section">
            <div className="profile-dropdown-label">
              <GlobeIcon />
              <span>{t("nav.language")}</span>
            </div>
            <div className="profile-dropdown-pills" role="radiogroup" aria-label={t("nav.language")}>
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={lang === l.code}
                  className={`profile-pill${lang === l.code ? " profile-pill-active" : ""}`}
                  onClick={() => chooseLang(l.code)}
                >
                  {l.short}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-dropdown-section">
            <div className="profile-dropdown-label">
              {mode === "dark" ? <MoonIcon /> : <SunIcon />}
              <span>{t("settings.appearance")}</span>
            </div>
            <div className="profile-dropdown-pills profile-dropdown-pills-2" role="radiogroup" aria-label={t("settings.appearance")}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "light"}
                className={`profile-pill${mode === "light" ? " profile-pill-active" : ""}`}
                onClick={() => setMode("light")}
              >
                <SunIcon />
                <span>{t("settings.themeLight")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "dark"}
                className={`profile-pill${mode === "dark" ? " profile-pill-active" : ""}`}
                onClick={() => setMode("dark")}
              >
                <MoonIcon />
                <span>{t("settings.themeDark")}</span>
              </button>
            </div>
          </div>

          <div className="profile-dropdown-divider" role="separator" />

          <Link to="/settings" className="profile-dropdown-link" onClick={close}>
            <SettingsIcon />
            <span>{t("nav.settings")}</span>
          </Link>

          {ready && session && (
            <button
              type="button"
              className="profile-dropdown-link profile-dropdown-logout"
              onClick={() => {
                close();
                void supabase.auth.signOut();
              }}
            >
              <span>{t("nav.logout")}</span>
            </button>
          )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
