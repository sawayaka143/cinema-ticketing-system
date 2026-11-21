import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { Badge } from "./ui/Badge";
import { BrandMark } from "./ui/BrandMark";
import { Button } from "./ui/Button";

export function Layout() {
  const { session, ready, me } = useAuth();
  const staffRole = me?.staff?.role ?? null;
  const staffLabel = staffRole === "cashier" ? "Box office" : "Manager";
  const location = useLocation();
  // The sheet is open only for the path it was opened on, so navigating closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const menuOpen = openAt === location.pathname;
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the phone account sheet on outside tap or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenAt(null);
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
  }, [menuOpen]);

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
            {staffRole && <NavLink to="/manager">{staffLabel}</NavLink>}
          </nav>
          <div className="account">
            {!ready ? null : session ? (
              <>
                {staffRole && (
                  <Badge tone="accent" variant="subtle" className="cap account-desktop">
                    {staffRole}
                  </Badge>
                )}
                <span className="who">{session.user.email}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="account-desktop"
                  onClick={() => supabase.auth.signOut()}
                >
                  Log out
                </Button>
                <div className="account-menu" ref={menuRef}>
                  <button
                    type="button"
                    className="avatar-btn"
                    aria-label="Account menu"
                    aria-expanded={menuOpen}
                    aria-controls="account-sheet"
                    onClick={() => setOpenAt(menuOpen ? null : location.pathname)}
                  >
                    {(session.user.email ?? "?").charAt(0).toUpperCase()}
                  </button>
                  {menuOpen && (
                    <div className="account-sheet" id="account-sheet" role="dialog" aria-label="Account">
                      <p className="account-sheet-email">{session.user.email}</p>
                      {staffRole && (
                        <Badge tone="accent" variant="subtle" className="cap">
                          {staffRole}
                        </Badge>
                      )}
                      <Button variant="outline" size="md" onClick={() => supabase.auth.signOut()}>
                        Log out
                      </Button>
                    </div>
                  )}
                </div>
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
      <nav className="tabbar" aria-label="Main (phone)">
        <NavLink to="/" end>
          What&apos;s on
        </NavLink>
        <NavLink to="/me/bookings">My bookings</NavLink>
        {staffRole && <NavLink to="/manager">{staffLabel}</NavLink>}
      </nav>
      <footer className="foot">
        <div className="rail-content foot-inner">
          <p>Alatau Cinema · Almaty</p>
          <p className="foot-info">
            Halls 2D · 3D · IMAX · All times Asia/Almaty (UTC+5) · Prices in tenge (₸)
          </p>
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
