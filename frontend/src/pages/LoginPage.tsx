import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
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
  const [mode, setMode] = useState<Mode>("login");
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
      setMessage({ tone: "info", text: "Check your email to confirm the account, then log in." });
      setMode("login");
    } else {
      await ensureCustomer(data.session.user.user_metadata.full_name as string | undefined);
      navigate("/");
    }
    setBusy(false);
  }

  return (
    <section className="panel narrow">
      <h1>{mode === "login" ? "Log in" : "Create an account"}</h1>
      <form className="form" onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Full name
            <input name="full_name" autoComplete="name" required maxLength={100} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="solid" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      {message && <Status tone={message.tone}>{message.text}</Status>}
      <p className="switch">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </section>
  );
}
