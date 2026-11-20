import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { Badge } from "./ui/Badge";
import { BrandMark } from "./ui/BrandMark";
import { Button } from "./ui/Button";

export function Layout() {
  const { session, ready, me } = useAuth();
  const staffRole = me?.staff?.role ?? null;

  return (
    <>
      <header className="rail">
        <div className="rail-content rail-top">
          <Link to="/" className="mark" aria-label="Alatau Cinema Home">
            <BrandMark size="md" />
            <span>Alatau Cinema</span>
          </Link>
          <nav className="rail-nav" aria-label="Main">
            <NavLink to="/" end>
              What&apos;s on
            </NavLink>
            <NavLink to="/me/bookings">My bookings</NavLink>
            {staffRole && (
              <NavLink to="/manager">{staffRole === "cashier" ? "Box office" : "Manager"}</NavLink>
            )}
          </nav>
          <div className="account">
            {!ready ? null : session ? (
              <>
                {staffRole && (
                  <Badge tone="accent" variant="subtle" className="cap">
                    {staffRole}
                  </Badge>
                )}
                <span className="who">{session.user.email}</span>
                <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
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
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="foot">
        <div className="rail-content foot-inner">
          <p>Alatau Cinema · Almaty</p>
          <p>Halls 2D · 3D · IMAX · All times Asia/Almaty (UTC+5) · Prices in tenge (₸)</p>
        </div>
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
