import { useState } from "react";
import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { almatyToday, price } from "../../lib/format";
import { messageOf, must, useApi } from "../../lib/useApi";
import { Button, ErrorState, Skeleton } from "../ui";

type Sales = components["schemas"]["SalesReport"];

/** YYYY-MM-DD `days` before (negative) or after a YYYY-MM-DD date. */
function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const short = (iso: string) => dayLabel.format(new Date(`${iso}T00:00:00Z`));

/** Sales in a period: totals, revenue per day, a table per movie, and the Excel download. */
export function AdminDashboard() {
  const today = almatyToday();
  const [from, setFrom] = useState(shift(today, -29));
  const [to, setTo] = useState(today);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const query = { from, to };
  const sales = useApi(
    () => api.GET("/api/admin/sales", { params: { query } }).then(must),
    `${from}:${to}`,
  );

  const presets: { label: string; from: string; to: string }[] = [
    { label: "Today", from: today, to: today },
    { label: "7 days", from: shift(today, -6), to: today },
    { label: "30 days", from: shift(today, -29), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await api
        .GET("/api/admin/sales/export", { params: { query }, parseAs: "blob" })
        .then((res) => must(res as { data?: Blob; error?: unknown; response: Response }));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sales_${from}_${to}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(messageOf(err));
    } finally {
      setDownloading(false);
    }
  }

  const badPeriod = from > to;

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <label>
          From
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <div className="admin-presets">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              className={p.from === from && p.to === to ? "on" : ""}
              onClick={() => {
                setFrom(p.from);
                setTo(p.to);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Button variant="solid" size="sm" onClick={download} loading={downloading} disabled={badPeriod}>
          Download Excel
        </Button>
      </div>
      {downloadError && (
        <p className="admin-error" role="alert">
          Couldn&apos;t download: {downloadError}
        </p>
      )}

      {badPeriod ? (
        <p className="admin-error">The start date is after the end date.</p>
      ) : sales.state === "error" ? (
        <ErrorState
          title="Couldn't load sales"
          message="The sales numbers didn't load. Try again."
          details={sales.message}
          onRetry={sales.reload}
        />
      ) : sales.state === "loading" ? (
        <div aria-busy="true">
          <Skeleton width="100%" height="5rem" radius={6} />
          <Skeleton width="100%" height="12rem" radius={6} style={{ marginTop: "1rem" }} />
        </div>
      ) : (
        <SalesView sales={sales.data} />
      )}
    </div>
  );
}

function SalesView({ sales }: { sales: Sales }) {
  const { total, by_day: days, by_movie: movies } = sales;
  const top = Math.max(1, ...days.map((d) => Number(d.revenue)));
  const totalRevenue = Number(total.revenue) || 1;

  return (
    <>
      <dl className="admin-totals">
        <div>
          <dt>Revenue</dt>
          <dd>{price(total.revenue)}</dd>
        </div>
        <div>
          <dt>Tickets sold</dt>
          <dd>{total.tickets.toLocaleString("ru-RU")}</dd>
        </div>
        <div>
          <dt>Bookings</dt>
          <dd>{total.bookings.toLocaleString("ru-RU")}</dd>
        </div>
        <div>
          <dt>Average ticket</dt>
          <dd>{total.tickets ? price(String(Number(total.revenue) / total.tickets)) : "—"}</dd>
        </div>
      </dl>

      <h2 className="admin-h2">Revenue per day</h2>
      {total.tickets === 0 ? (
        <p className="admin-muted">No tickets were sold in this period.</p>
      ) : (
        <div className="admin-chart" role="img" aria-label={`Revenue per day from ${short(sales.date_from)} to ${short(sales.date_to)}`}>
          {days.map((d) => (
            <div key={d.day} className="admin-bar" title={`${short(d.day)}: ${price(d.revenue)}, ${d.tickets} tickets`}>
              <span style={{ height: `${(Number(d.revenue) / top) * 100}%` }} />
            </div>
          ))}
          <span className="admin-chart-from">{short(sales.date_from)}</span>
          <span className="admin-chart-to">{short(sales.date_to)}</span>
        </div>
      )}

      <h2 className="admin-h2">By movie</h2>
      {movies.length === 0 ? (
        <p className="admin-muted">Nothing to show yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Movie</th>
              <th className="num">Tickets</th>
              <th className="num">Bookings</th>
              <th className="num">Revenue</th>
              <th>Share of revenue</th>
            </tr>
          </thead>
          <tbody>
            {movies.map((m) => {
              const share = (Number(m.revenue) / totalRevenue) * 100;
              return (
                <tr key={m.movie_id}>
                  <td>{m.title}</td>
                  <td className="num">{m.tickets}</td>
                  <td className="num">{m.bookings}</td>
                  <td className="num">{price(m.revenue)}</td>
                  <td>
                    <span className="admin-share">
                      <i style={{ width: `${share}%` }} />
                    </span>
                    <small>{Math.round(share)}%</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
