import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { BrandMark } from "./ui/BrandMark";
import { Button } from "./ui/Button";

export function Layout() {
  const { session, ready } = useAuth();

  return (
    <>
      <header className="rail">
        <div className="rail-tier rail-tier-brand">
          <div className="rail-content rail-top">
            <Link to="/" className="mark" aria-label="Alatau Cinema Home">
              <BrandMark size="md" />
              <span>Alatau Cinema</span>
            </Link>
            <div className="account">
              {!ready ? null : session ? (
                <>
                  <span className="who">{session.user.email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => supabase.auth.signOut()}
                  >
                    Log out
                  </Button>
                </>
              ) : (
                <Button as={Link} to="/login" variant="ghost" size="sm">
                  Log in
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="rail-tier rail-tier-nav">
          <nav className="rail-content rail-nav" aria-label="Main">
            <NavLink to="/" end>
              What&apos;s on
            </NavLink>
            <NavLink to="/me/bookings">My bookings</NavLink>
          </nav>
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
