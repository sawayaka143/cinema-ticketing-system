import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../lib/auth-context";
import { useI18n } from "../lib/i18n";
import { ProfileMenu } from "./PhoneHeaderTools";
import { DashboardIcon, FilmIcon, SettingsIcon, TicketIcon } from "./TabIcons";
import { BrandMark } from "./ui/BrandMark";

export function Layout() {
  const { me } = useAuth();
  const { t } = useI18n();
  const staffRole = me?.staff?.role ?? null;
  const staffLabel = staffRole === "cashier" ? t("nav.boxOffice") : t("nav.manager");

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
              {t("nav.whatsOn")}
            </NavLink>
            <NavLink to="/me/bookings">{t("nav.myBookings")}</NavLink>
            {staffRole && <NavLink to="/manager">{staffLabel}</NavLink>}
          </nav>
          <div className="rail-end">
            <ProfileMenu />
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <div className="tabbar-wrap">
        <nav className="tabbar" aria-label="Main (phone)">
          <NavLink to="/" end>
            <FilmIcon />
            <span>{t("nav.whatsOn")}</span>
          </NavLink>
          <NavLink to="/me/bookings">
            <TicketIcon />
            <span>{t("nav.bookings")}</span>
          </NavLink>
          {staffRole && (
            <NavLink to="/manager">
              <DashboardIcon />
              <span>{staffLabel}</span>
            </NavLink>
          )}
          <NavLink to="/settings">
            <SettingsIcon />
            <span>{t("nav.settings")}</span>
          </NavLink>
        </nav>
      </div>
      <footer className="foot">
        <div className="rail-content foot-inner">
          <p>{t("footer.city")}</p>
          <p className="foot-info">{t("footer.info")}</p>
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
