import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { EyeIcon, EyeOffIcon } from "../components/TabIcons";
import { Button, Card, FadeIn } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { supabase } from "../lib/supabase";

type Mode = "login" | "signup";

/** Creates the customer profile on first login, using the name given at sign-up. */
async function ensureCustomer(fullName: string | undefined) {
  const { data: me } = await api.GET("/api/me");
  if (me && !me.customer && fullName) {
    await api.POST("/api/me/customer", { body: { full_name: fullName } });
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next");
  const safeNext = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const fullName = String(form.get("full_name") ?? "").trim();
    setBusy(true);
    setMessage(null);

    const { data, error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });

    if (error) {
      setMessage({ tone: "error", text: error.message });
    } else if (!data.session) {
      setMessage({ tone: "info", text: t("auth.checkEmail") });
      setMode("login");
    } else {
      await ensureCustomer(data.session.user.user_metadata.full_name as string | undefined);
      navigate(safeNext, { replace: true });
    }
    setBusy(false);
  }

  const switchMode = () => {
    setMessage(null);
    setMode(mode === "login" ? "signup" : "login");
  };

  return (
    <FadeIn direction="up">
      <Card as="section" elevated className="panel narrow auth-card">
        <FadeIn key={mode} direction="up" duration={260} className="auth-stage">
          <div className="auth-head">
            <h1>{mode === "login" ? t("auth.loginTitle") : t("auth.signupTitle")}</h1>
            <p className="muted">
              {mode === "login" ? t("auth.loginSubtitle") : t("auth.signupSubtitle")}
            </p>
          </div>

          <form className="form auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <label>
                {t("auth.fullName")}
                <input
                  name="full_name"
                  autoComplete="name"
                  placeholder={t("auth.fullNamePlaceholder")}
                  required
                  maxLength={100}
                />
              </label>
            )}
            <label>
              {t("auth.email")}
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder={t("auth.emailPlaceholder")}
                required
              />
            </label>
            <label>
              {t("auth.password")}
              <div className="password-field">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <Button type="submit" variant="solid" size="lg" className="auth-submit-btn" loading={busy} disabled={busy}>
              {busy ? t("auth.pleaseWait") : mode === "login" ? t("auth.loginTitle") : t("auth.signUp")}
            </Button>
          </form>

          {message && <Status tone={message.tone}>{message.text}</Status>}

          <div className="auth-divider" role="separator">
            <span>{mode === "login" ? t("auth.newHere") : t("auth.alreadyHave")}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="auth-switch-btn"
            onClick={switchMode}
          >
            {mode === "login" ? t("auth.createAccountCta") : t("auth.loginTitle")}
          </Button>
        </FadeIn>
      </Card>
    </FadeIn>
  );
}
