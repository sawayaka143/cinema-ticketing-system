import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { MoonIcon, SunIcon } from "../components/TabIcons";
import { Button, Card, EmptyState, FadeIn, Skeleton } from "../components/ui";
import { PRESET_AVATARS, UserAvatar, resizeAvatarFile } from "../components/UserAvatar";
import { useAuth } from "../lib/auth-context";
import { LANGUAGES, useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { messageOf, must } from "../lib/useApi";

const KZ_CITIES = [
  "Almaty",
  "Astana",
  "Shymkent",
  "Karaganda",
  "Aktobe",
  "Atyrau",
  "Aktau",
  "Pavlodar",
  "Oskemen",
  "Semey",
  "Taraz",
  "Kostanay",
];

function ProfileForm({
  initialName,
  initialPhone,
  initialCity,
  initialAvatar,
  email,
  hasCustomer,
  onSaved,
}: {
  initialName: string;
  initialPhone: string;
  initialCity: string;
  initialAvatar: string | null;
  email: string;
  hasCustomer: boolean;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [city, setCity] = useState(initialCity);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState(email);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus(null);
    try {
      const dataUrl = await resizeAvatarFile(file);
      setAvatarUrl(dataUrl);
    } catch {
      setStatus({ tone: "error", text: t("settings.iconError") });
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const payload = {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        city: city.trim() || null,
        avatar_url: avatarUrl,
      };
      if (hasCustomer) {
        await api.PATCH("/api/me/customer", { body: payload }).then(must);
      } else {
        await api.POST("/api/me/customer", { body: payload }).then(must);
      }
      onSaved();
      setStatus({ tone: "info", text: t("settings.profileSaved") });
    } catch (err) {
      setStatus({ tone: "error", text: messageOf(err) });
    }
    setBusy(false);
  }

  async function updateEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newEmail.trim();
    if (!trimmed || trimmed.toLowerCase() === email.toLowerCase()) {
      setEmailStatus({ tone: "error", text: t("settings.emailUnchanged") });
      return;
    }
    setEmailBusy(true);
    setEmailStatus(null);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) {
      setEmailStatus({ tone: "error", text: error.message });
    } else {
      setEmailStatus({ tone: "info", text: t("settings.emailSent", { email: trimmed }) });
    }
    setEmailBusy(false);
  }

  return (
    <>
      <Card as="section" elevated className="settings-card">
        <div className="settings-card-head">
          <h2>{t("settings.profile")}</h2>
          <p className="muted">{t("settings.profileDesc")}</p>
        </div>

        <form className="form settings-form" onSubmit={saveProfile}>
          <div className="avatar-editor">
            <UserAvatar avatarUrl={avatarUrl} name={fullName} email={email} size="lg" />
            <div className="avatar-editor-actions">
              <span className="avatar-editor-label">{t("settings.iconLabel")}</span>
              <div className="avatar-editor-buttons">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={onPickFile}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  {t("settings.uploadIcon")}
                </Button>
                {avatarUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl(null)}>
                    {t("settings.removeIcon")}
                  </Button>
                )}
              </div>
              <span className="settings-hint">{t("settings.iconHint")}</span>
            </div>
          </div>

          <div className="avatar-presets">
            <span className="settings-hint">{t("settings.presetsLabel")}</span>
            <div className="avatar-presets-grid" role="group" aria-label={t("settings.presetsLabel")}>
              {PRESET_AVATARS.map((preset) => {
                const active = avatarUrl === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset-btn${active ? " preset-btn-active" : ""}`}
                    aria-pressed={active}
                    aria-label={preset.label}
                    title={preset.label}
                    onClick={() => setAvatarUrl(preset.id)}
                  >
                    <UserAvatar avatarUrl={preset.id} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-fields">
            <label>
              {t("settings.fullName")}
              <input
                name="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
                maxLength={100}
              />
            </label>
            <label>
              {t("settings.phone")}
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("settings.phonePlaceholder")}
                autoComplete="tel"
                maxLength={30}
              />
            </label>
            <label>
              {t("settings.city")}
              <input
                name="city"
                list="kz-cities"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("settings.cityPlaceholder")}
                autoComplete="address-level2"
                maxLength={60}
              />
              <datalist id="kz-cities">
                {KZ_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settings-submit">
            <Button type="submit" variant="solid" size="md" loading={busy} disabled={busy}>
              {busy ? t("settings.saving") : t("settings.saveProfile")}
            </Button>
          </div>
          {status && <Status tone={status.tone}>{status.text}</Status>}
        </form>
      </Card>

      <Card as="section" elevated className="settings-card">
        <div className="settings-card-head">
          <h2>{t("settings.emailSection")}</h2>
          <p className="muted">{t("settings.emailDesc")}</p>
        </div>
        <form className="form settings-form" onSubmit={updateEmail}>
          <label>
            {t("auth.email")}
            <input
              name="email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <div className="settings-submit">
            <Button type="submit" variant="outline" size="md" loading={emailBusy} disabled={emailBusy}>
              {t("settings.updateEmail")}
            </Button>
          </div>
          {emailStatus && <Status tone={emailStatus.tone}>{emailStatus.text}</Status>}
        </form>
      </Card>
    </>
  );
}

export function SettingsPage() {
  const { session, ready, me, meReady, refreshMe } = useAuth();
  const { mode, setMode } = useTheme();
  const { lang, setLang, t } = useI18n();

  const customer = me?.customer;
  const email = session?.user.email ?? "";
  const profileKey = `${session?.user.id ?? "anon"}:${customer?.customer_id ?? "none"}:${customer?.full_name ?? ""}:${customer?.phone ?? ""}:${customer?.city ?? ""}:${customer?.avatar_url ?? ""}`;

  return (
    <div className="settings-page">
      <FadeIn direction="up" delay={0}>
        <div className="settings-head">
          <h1>{t("settings.title")}</h1>
          <p className="muted">{t("settings.subtitle")}</p>
        </div>
      </FadeIn>

      <FadeIn direction="up" delay={50}>
        {!ready || (session && !meReady) ? (
          <Card as="section" elevated className="settings-card" aria-busy="true">
            <Skeleton width="8rem" height="1.5rem" radius={6} />
            <Skeleton width="100%" height="4.5rem" radius={12} style={{ marginTop: "1rem" }} />
            <Skeleton width="100%" height="3rem" radius={10} style={{ marginTop: "0.75rem" }} />
          </Card>
        ) : session ? (
          <ProfileForm
            key={profileKey}
            initialName={
              customer?.full_name ??
              (session.user.user_metadata?.full_name as string | undefined) ??
              ""
            }
            initialPhone={customer?.phone ?? ""}
            initialCity={customer?.city ?? ""}
            initialAvatar={customer?.avatar_url ?? null}
            email={email}
            hasCustomer={!!customer}
            onSaved={refreshMe}
          />
        ) : (
          <EmptyState
            title={t("settings.signInPromptTitle")}
            description={t("settings.signInPromptDesc")}
            action={
              <Button as={Link} to="/login" variant="solid" size="md">
                {t("nav.login")}
              </Button>
            }
          />
        )}
      </FadeIn>

      <FadeIn direction="up" delay={100}>
        <Card as="section" elevated className="settings-card">
          <div className="settings-card-head">
            <h2>{t("settings.appearance")}</h2>
            <p className="muted">{t("settings.appearanceDesc")}</p>
          </div>
          <div className="theme-choices" role="radiogroup" aria-label={t("settings.appearance")}>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "light"}
              className={`theme-choice${mode === "light" ? " theme-choice-active" : ""}`}
              onClick={() => setMode("light")}
            >
              <span className="theme-choice-icon">
                <SunIcon />
              </span>
              <span className="theme-choice-text">
                <b>{t("settings.themeLight")}</b>
                <span>{t("settings.themeLightDesc")}</span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "dark"}
              className={`theme-choice${mode === "dark" ? " theme-choice-active" : ""}`}
              onClick={() => setMode("dark")}
            >
              <span className="theme-choice-icon">
                <MoonIcon />
              </span>
              <span className="theme-choice-text">
                <b>{t("settings.themeDark")}</b>
                <span>{t("settings.themeDarkDesc")}</span>
              </span>
            </button>
          </div>
        </Card>
      </FadeIn>

      <FadeIn direction="up" delay={150}>
        <Card as="section" elevated className="settings-card">
          <div className="settings-card-head">
            <h2>{t("settings.language")}</h2>
            <p className="muted">{t("settings.languageDesc")}</p>
          </div>
          <div className="lang-choices" role="radiogroup" aria-label={t("settings.language")}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={lang === l.code}
                className={`lang-choice${lang === l.code ? " lang-choice-active" : ""}`}
                onClick={() => setLang(l.code)}
              >
                <span className="lang-choice-short">{l.short}</span>
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        </Card>
      </FadeIn>

      {session && (
        <FadeIn direction="up" delay={200}>
          <Card as="section" elevated className="settings-card settings-account-card">
            <div className="settings-card-head">
              <h2>{t("settings.account")}</h2>
              <p className="muted">{t("settings.signedInAs", { email })}</p>
            </div>
            <Button variant="outline" size="md" onClick={() => supabase.auth.signOut()}>
              {t("nav.logout")}
            </Button>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
