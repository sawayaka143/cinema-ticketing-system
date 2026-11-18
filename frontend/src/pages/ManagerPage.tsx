import { useState } from "react";
import { Link } from "react-router";
import { ManagerReportTab } from "../components/manager/ManagerReportTab";
import { ManagerScheduleTab } from "../components/manager/ManagerScheduleTab";
import { Badge, Button, EmptyState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";

type Tab = "report" | "schedule";

const MANAGER_TABS: { id: Tab; label: string }[] = [
  { id: "report", label: "Occupancy report" },
  { id: "schedule", label: "Schedule" },
];

export function ManagerPage() {
  const { session, ready, me, meReady } = useAuth();
  const [tab, setTab] = useState<Tab>("report");
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
          description="Sign in with a manager or admin account to view the report and manage screenings."
          action={
            <Button as={Link} to="/login" variant="solid">
              Log in
            </Button>
          }
        />
      </FadeIn>
    );
  }

  const isManager = me?.staff?.role === "manager" || me?.staff?.role === "admin";
  if (!isManager) {
    return (
      <FadeIn direction="up">
        <EmptyState
          title="Manager access required"
          description="Your account does not have a manager or admin staff role."
          action={
            <Button as={Link} to="/" variant="ghost">
              Back to what&apos;s on
            </Button>
          }
        />
      </FadeIn>
    );
  }

  const staff = me.staff!;
  const bump = () => setRefreshKey((n) => n + 1);

  return (
    <FadeIn direction="up">
      <section>
        <div className="mgr-header">
          <h1>Manager panel</h1>
          <span className="muted">
            {staff.full_name} ·{" "}
            <Badge tone="accent" variant="subtle" className="cap">
              {staff.role}
            </Badge>
          </span>
        </div>

        <nav className="mgr-tabs" aria-label="Manager sections">
          {MANAGER_TABS.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={tab === item.id ? "solid" : "ghost"}
              onClick={() => {
                setPrefillTitle(null);
                setTab(item.id);
              }}
            >
              {item.label}
            </Button>
          ))}
        </nav>

        {tab === "report" && (
          <ManagerReportTab
            refreshKey={refreshKey}
            onAddShow={(title) => {
              setPrefillTitle(title);
              setTab("schedule");
            }}
          />
        )}
        {tab === "schedule" && (
          <ManagerScheduleTab
            refreshKey={refreshKey}
            prefillTitle={prefillTitle}
            onChanged={bump}
          />
        )}
      </section>
    </FadeIn>
  );
}
