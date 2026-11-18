import { useState } from "react";
import { Link } from "react-router";
import { ManagerBoxOfficeTab } from "../components/manager/ManagerBoxOfficeTab";
import { ManagerHallsTab, ManagerMoviesTab } from "../components/manager/ManagerCatalogTabs";
import { ManagerReportTab } from "../components/manager/ManagerReportTab";
import { ManagerScheduleTab } from "../components/manager/ManagerScheduleTab";
import { Badge, Button, EmptyState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";

type Tab = "report" | "schedule" | "movies" | "halls" | "box-office";

const MANAGER_TABS: { id: Tab; label: string }[] = [
  { id: "report", label: "Occupancy report" },
  { id: "schedule", label: "Schedule" },
  { id: "movies", label: "Movies" },
  { id: "halls", label: "Halls" },
  { id: "box-office", label: "Box office" },
];

export function ManagerPage() {
  const { session, ready, me, meReady } = useAuth();
  const [tab, setTab] = useState<Tab | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [prefillTitle, setPrefillTitle] = useState<string | null>(null);

  if (!ready || !meReady) {
    return (
      <section aria-busy="true">
        <Skeleton width="16rem" height="2.25rem" radius={8} />
        <Skeleton width="100%" height="3rem" radius={10} style={{ marginTop: "1rem" }} />
        <Skeleton width="100%" height="16rem" radius={12} style={{ marginTop: "1.5rem" }} />
      </section>
    );
  }

  if (!session) {
    return (
      <FadeIn direction="up">
        <EmptyState
          title="Log in to open the manager panel"
          description="Sign in with a staff account to manage movies, halls, screenings, and view the report."
          action={
            <Button as={Link} to="/login" variant="solid">
              Log in
            </Button>
          }
        />
      </FadeIn>
    );
  }

  if (!me?.staff) {
    return (
      <FadeIn direction="up">
        <EmptyState
          title="Staff access required"
          description="Your account is signed in as a customer. A staff role is needed here."
          action={
            <Button as={Link} to="/" variant="ghost">
              Back to what&apos;s on
            </Button>
          }
        />
      </FadeIn>
    );
  }

  const isManager = me.staff.role === "manager" || me.staff.role === "admin";
  const tabs = isManager ? MANAGER_TABS : MANAGER_TABS.filter((t) => t.id === "box-office");
  const activeTab: Tab =
    tab && tabs.some((t) => t.id === tab) ? tab : isManager ? "report" : "box-office";

  const bump = () => setRefreshKey((n) => n + 1);

  return (
    <FadeIn direction="up">
      <section>
        <div className="mgr-header">
          <h1>{isManager ? "Manager panel" : "Box office"}</h1>
          <span className="muted">
            {me.staff.full_name} ·{" "}
            <Badge tone="accent" variant="subtle" className="cap">
              {me.staff.role}
            </Badge>
          </span>
        </div>

        <nav className="mgr-tabs" aria-label="Manager sections">
          {tabs.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={activeTab === item.id ? "solid" : "ghost"}
              onClick={() => {
                setPrefillTitle(null);
                setTab(item.id);
              }}
            >
              {item.label}
            </Button>
          ))}
        </nav>

        {activeTab === "report" && (
          <ManagerReportTab
            refreshKey={refreshKey}
            onAddShow={(title) => {
              setPrefillTitle(title);
              setTab("schedule");
            }}
          />
        )}
        {activeTab === "schedule" && (
          <ManagerScheduleTab
            refreshKey={refreshKey}
            prefillTitle={prefillTitle}
            onChanged={bump}
          />
        )}
        {activeTab === "movies" && <ManagerMoviesTab refreshKey={refreshKey} onChanged={bump} />}
        {activeTab === "halls" && <ManagerHallsTab refreshKey={refreshKey} onChanged={bump} />}
        {activeTab === "box-office" && <ManagerBoxOfficeTab />}
      </section>
    </FadeIn>
  );
}
