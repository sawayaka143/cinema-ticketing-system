import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { MoonIcon, SunIcon } from "../components/TabIcons";
import { Button, Card, EmptyState, FadeIn, SegmentedPill, Skeleton } from "../components/ui";
import { PRESET_AVATARS, UserAvatar, resizeAvatarBlob } from "../components/UserAvatar";
import { useAuth } from "../lib/auth-context";
import { LANGUAGES, type LangCode, useI18n } from "../lib/i18n";
import { uploadAvatar } from "../lib/posterUpload";
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
    setUploadingAvatar(true);
    try {
      const blob = await resizeAvatarBlob(file);
      const url = await uploadAvatar(blob);
      setAvatarUrl(url);
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : t("settings.iconError");
      setStatus({ tone: "error", text });
    } finally {
      setUploadingAvatar(false);
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
    <Card as="section" elevated className="settings-card">
      <h2>{t("settings.profile")}</h2>

      <form className="form settings-form" onSubmit={saveProfile}>
        <div className="avatar-editor">
          <UserAvatar avatarUrl={avatarUrl} name={fullName} email={email} size="md" />
          <div className="avatar-editor-buttons">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onPickFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={uploadingAvatar}
              disabled={uploadingAvatar || busy}
              onClick={() => fileRef.current?.click()}
            >
              {t("settings.uploadIcon")}
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploadingAvatar || busy}
                onClick={() => setAvatarUrl(null)}
              >
                {t("settings.removeIcon")}
              </Button>
            )}
          </div>
        </div>

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

      <hr className="settings-divider" />

      <form className="form settings-form" onSubmit={updateEmail}>
        <label>
          {t("settings.emailSection")}
          <input
            name="email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <p className="settings-hint">{t("settings.emailDesc")}</p>
        <div className="settings-submit">
          <Button type="submit" variant="outline" size="md" loading={emailBusy} disabled={emailBusy}>
            {t("settings.updateEmail")}
          </Button>
        </div>
        {emailStatus && <Status tone={emailStatus.tone}>{emailStatus.text}</Status>}
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const { session, ready, me, meReady, refreshMe } = useAuth();
  const { mode, setMode } = useTheme();
  const { lang, setLang, t } = useI18n();

  const customer = me?.customer;
  const email = session?.user.email ?? "";
  const profileKey = `${session?.user.id ?? "anon"}:${customer?.customer_id ?? "none"}:${customer?.full_name ?? ""}:${customer?.phone ?? ""}:${customer?.city ?? ""}:${customer?.avatar_url ?? ""}`;

  const appearanceOptions = [
    {
      value: "light" as const,
      label: (
        <>
          <SunIcon />
          <span>{t("settings.themeLight")}</span>
        </>
      ),
    },
    {
      value: "dark" as const,
      label: (
        <>
          <MoonIcon />
          <span>{t("settings.themeDark")}</span>
        </>
      ),
    },
  ];

  const languageOptions = LANGUAGES.map((l) => ({
    value: l.code as LangCode,
    label: l.short,
    ariaLabel: l.name,
  }));

  return (
    <div className="settings-page">
      <FadeIn direction="up" delay={0}>
        <div className="settings-head">
          <h1>{t("settings.title")}</h1>
        </div>
      </FadeIn>

      <FadeIn direction="up" delay={40}>
        {!ready || (session && !meReady) ? (
          <Card as="section" elevated className="settings-card" aria-busy="true">
            <Skeleton width="8rem" height="1.5rem" radius={6} />
            <Skeleton width="100%" height="4rem" radius={12} style={{ marginTop: "0.75rem" }} />
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

      <FadeIn direction="up" delay={80}>
        <Card as="section" elevated className="settings-card">
          <h2>{t("settings.preferences")}</h2>
          <div className="settings-pref-group">
            <div className="settings-pref-row">
              <span className="settings-pref-label">{t("settings.appearance")}</span>
              <SegmentedPill
                value={mode}
                options={appearanceOptions}
                onChange={setMode}
                ariaLabel={t("settings.appearance")}
              />
            </div>
            <div className="settings-pref-row">
              <span className="settings-pref-label">{t("settings.language")}</span>
              <SegmentedPill
                value={lang}
                options={languageOptions}
                onChange={setLang}
                ariaLabel={t("nav.language")}
              />
            </div>
          </div>
        </Card>
      </FadeIn>

      {session && (
        <FadeIn direction="up" delay={120}>
          <Card as="section" elevated className="settings-card settings-account-card">
            <div className="settings-account-info">
              <h2>{t("settings.account")}</h2>
              <p className="muted">{t("settings.signedInAs", { email })}</p>
            </div>
            <Button variant="danger" size="md" onClick={() => supabase.auth.signOut()}>
              {t("nav.logout")}
            </Button>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
