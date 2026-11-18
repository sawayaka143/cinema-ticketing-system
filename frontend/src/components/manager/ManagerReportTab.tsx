import { api } from "../../api/client";
import { type ReportRow, price, when } from "../../lib/format";
import { must, useApi } from "../../lib/useApi";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "../ui";

function actionBadge(row: ReportRow) {
  const pct = row.occupancy_pct === null ? null : Number(row.occupancy_pct);
  if (pct === null) return <Badge tone="neutral">No seats</Badge>;
  if (pct < 30) return <Badge tone="warning" variant="subtle">Below 30% · Move or cancel</Badge>;
  if (pct > 90) return <Badge tone="success" variant="subtle">Above 90% · Add showtime</Badge>;
  return <Badge tone="neutral">On track</Badge>;
}

/** Next-7-day occupancy and revenue report, sorted emptiest first to highlight action items. */
export function ManagerReportTab({
  refreshKey,
  onAddShow,
}: {
  refreshKey: number;
  onAddShow: (movieTitle: string) => void;
}) {
  const report = useApi(() => api.GET("/api/admin/report").then(must), refreshKey);

  if (report.state === "loading") {
    return (
      <div aria-busy="true">
        <Skeleton width="100%" height="4.5rem" radius={12} />
        <Skeleton width="100%" height="14rem" radius={12} style={{ marginTop: "1rem" }} />
      </div>
    );
  }

  if (report.state === "error") {
    return (
      <ErrorState
        title="Couldn't load the report"
        message="Unable to fetch occupancy and revenue figures."
        details={report.message}
        onRetry={report.reload}
      />
    );
  }

  const rows = report.data;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No upcoming screenings in the next 7 days"
        description="Schedule screenings in the Schedule tab to track occupancy and revenue."
      />
    );
  }

  const totalSold = rows.reduce((sum, r) => sum + r.tickets_sold, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue), 0);
  const lowCount = rows.filter((r) => r.occupancy_pct !== null && Number(r.occupancy_pct) < 30).length;
  const highCount = rows.filter((r) => r.occupancy_pct !== null && Number(r.occupancy_pct) > 90).length;

  return (
    <section aria-label="Occupancy and revenue report">
      <div className="mgr-summary">
        <div className="mgr-stat">
          <span>Upcoming shows (7 days)</span>
          <b>{rows.length}</b>
        </div>
        <div className="mgr-stat">
          <span>Paid tickets</span>
          <b>{totalSold}</b>
        </div>
        <div className="mgr-stat">
          <span>Total revenue</span>
          <b>{price(String(totalRevenue))}</b>
        </div>
        <div className="mgr-stat">
          <span>Action needed (&lt;30% / &gt;90%)</span>
          <b>
            {lowCount} low · {highCount} full
          </b>
        </div>
      </div>

      <div className="mgr-toolbar">
        <h2>Next 7 days by occupancy (emptiest first)</h2>
        <Button size="sm" variant="ghost" onClick={report.reload}>
          Refresh report
        </Button>
      </div>

      <div className="mgr-table-wrap">
        <table className="mgr-table">
          <thead>
            <tr>
              <th scope="col">Movie</th>
              <th scope="col">Hall</th>
              <th scope="col">Showtime</th>
              <th scope="col" className="num">
                Sold / Cap
              </th>
              <th scope="col" className="num">
                Occupancy
              </th>
              <th scope="col" className="num">
                Revenue
              </th>
              <th scope="col">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.occupancy_pct === null ? null : Number(r.occupancy_pct);
              return (
                <tr key={r.screening_id}>
                  <td>
                    <b>{r.title}</b>
                  </td>
                  <td>{r.hall}</td>
                  <td>{when(r.start_time)}</td>
                  <td className="num">
                    {r.tickets_sold} / {r.capacity}
                  </td>
                  <td className="num">{pct === null ? "—" : `${pct.toFixed(1)}%`}</td>
                  <td className="num">{price(r.revenue)}</td>
                  <td>
                    <span className="mgr-row-actions">
                      {actionBadge(r)}
                      {pct !== null && pct > 90 && (
                        <Button size="sm" variant="ghost" onClick={() => onAddShow(r.title)}>
                          Add show
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
