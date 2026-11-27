import { useState } from "react";
import { Link } from "react-router";
import { AdminDashboard } from "../components/admin/AdminDashboard";
import { AdminMovies } from "../components/admin/AdminMovies";
import { AdminShowtimes } from "../components/admin/AdminShowtimes";
import { Button, EmptyState, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";

type Tab = "dashboard" | "movies" | "showtimes";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "movies", label: "Movies" },
  { id: "showtimes", label: "Showtimes" },
];

/** Admin panel: sales dashboard with Excel export, movies, and showtimes. Managers and admins. */
export function AdminPage() {
  const { session, ready, me, meReady } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (!ready || (session && !meReady)) {
    return (
      <section className="admin" aria-busy="true">
        <Skeleton width="10rem" height="2rem" radius={6} />
        <Skeleton width="100%" height="20rem" radius={6} style={{ marginTop: "1.5rem" }} />
      </section>
    );
  }

  if (!session) {
    return (
      <EmptyState
        title="Log in to open the admin panel"
        action={
          <Button as={Link} to="/login" variant="solid">
            Log in
          </Button>
        }
      />
    );
  }

  const role = me?.staff?.role;
  if (role !== "admin" && role !== "manager") {
    return (
      <EmptyState
        title="No access"
        description="The admin panel is for managers and admins."
        action={
          <Button as={Link} to="/" variant="ghost">
            Back to what&apos;s on
          </Button>
        }
      />
    );
  }

  return (
    <section className="admin">
      <header className="admin-head">
        <h1>Admin</h1>
        <nav className="admin-tabs" aria-label="Admin sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "on" : ""}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {tab === "dashboard" && <AdminDashboard />}
      {tab === "movies" && <AdminMovies />}
      {tab === "showtimes" && <AdminShowtimes />}
    </section>
  );
}
