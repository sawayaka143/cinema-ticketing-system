import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";

export function Layout() {
  const { session, ready } = useAuth();

  return (
    <>
      <header className="rail">
        <Link to="/" className="mark">
          <i aria-hidden="true" />
          Alatau Cinema
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end>
            What&apos;s on
          </NavLink>
          <NavLink to="/me/bookings">My bookings</NavLink>
        </nav>
        <div className="account">
          {!ready ? null : session ? (
            <>
              <span className="who">{session.user.email}</span>
              <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}>
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" className="ghost">
              Log in
            </Link>
          )}
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="foot">
        <p>Alatau Cinema is a fictional cinema. University project, KBTU.</p>
        <p>Times are Almaty time. Prices in tenge.</p>
      </footer>
    </>
  );
}

export function Status({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <p className={`status status-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
