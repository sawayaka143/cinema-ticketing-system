import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { almatyIso, almatyToday, price, span, when } from "../../lib/format";
import { messageOf, must, useApi } from "../../lib/useApi";
import { Status } from "../Layout";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "../ui";

/** Manage upcoming screenings: filter by day, schedule new shows (handling 409 overlaps), edit prices, delete. */
export function ManagerScheduleTab({
  refreshKey,
  prefillTitle,
  onChanged,
}: {
  refreshKey: number;
  prefillTitle: string | null;
  onChanged: () => void;
}) {
  const [filterDate, setFilterDate] = useState("");
  const [showForm, setShowForm] = useState(() => Boolean(prefillTitle));
  const [busyId, setBusyId] = useState<number | "create" | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});

  const screenings = useApi(
    () =>
      api
        .GET("/api/admin/screenings", { params: { query: filterDate ? { date: filterDate } : {} } })
        .then(must),
    `${refreshKey}:${filterDate}`,
  );
  const movies = useApi(() => api.GET("/api/admin/movies").then(must), refreshKey);
  const halls = useApi(() => api.GET("/api/admin/halls").then(must), refreshKey);

  if (screenings.state === "loading" || movies.state === "loading" || halls.state === "loading") {
    return (
      <div aria-busy="true">
        <Skeleton width="100%" height="3.5rem" radius={10} />
        <Skeleton width="100%" height="14rem" radius={12} style={{ marginTop: "1rem" }} />
      </div>
    );
  }

  if (screenings.state === "error" || movies.state === "error" || halls.state === "error") {
    const failed =
      screenings.state === "error" ? screenings : movies.state === "error" ? movies : halls;
    return (
      <ErrorState
        title="Couldn't load the schedule"
        message="Unable to load screenings, movies, or halls."
        details={failed.state === "error" ? failed.message : undefined}
        onRetry={failed.reload}
      />
    );
  }

  const activeMovies = movies.data.filter((m) => m.is_active);
  const prefilledMovie = prefillTitle
    ? activeMovies.find((m) => m.title === prefillTitle)?.movie_id
    : undefined;

  async function createScreening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const movieId = Number(form.get("movie_id"));
    const hallId = Number(form.get("hall_id"));
    const dateVal = String(form.get("date"));
    const timeVal = String(form.get("time"));
    const basePrice = Number(form.get("base_price"));

    setBusyId("create");
    setNotice(null);
    try {
      await api
        .POST("/api/admin/screenings", {
          body: {
            movie_id: movieId,
            hall_id: hallId,
            start_time: almatyIso(dateVal, timeVal),
            base_price: basePrice,
          },
        })
        .then(must);
      setNotice({ tone: "info", text: "Screening scheduled." });
      setShowForm(false);
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusyId(null);
  }

  async function savePrice(screeningId: number, fallback: string) {
    const raw = (priceDrafts[screeningId] ?? fallback).trim();
    const value = Number(raw);
    if (!value || value <= 0) {
      setNotice({ tone: "error", text: "Enter a positive price in tenge." });
      return;
    }
    setBusyId(screeningId);
    setNotice(null);
    try {
      await api
        .PATCH("/api/admin/screenings/{screening_id}", {
          params: { path: { screening_id: screeningId } },
          body: { base_price: value },
        })
        .then(must);
      setNotice({ tone: "info", text: `Updated price for screening #${screeningId}.` });
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusyId(null);
  }

  async function removeScreening(screeningId: number) {
    setBusyId(screeningId);
    setNotice(null);
    try {
      const res = await api.DELETE("/api/admin/screenings/{screening_id}", {
        params: { path: { screening_id: screeningId } },
      });
      if (!res.response.ok) {
        const detail = (res.error as { detail?: unknown } | undefined)?.detail;
        throw new Error(typeof detail === "string" ? detail : `Delete failed (${res.response.status})`);
      }
      setNotice({ tone: "info", text: `Deleted screening #${screeningId}.` });
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    }
    setBusyId(null);
  }

  return (
    <section aria-label="Screening schedule">
      <div className="mgr-toolbar">
        <h2>Schedule ({screenings.data.length})</h2>
        <div className="mgr-filters">
          <label className="muted small">
            Day filter{" "}
            <input
              type="date"
              className="mgr-inline-input"
              style={{ width: "9.5rem", textAlign: "left" }}
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </label>
          {filterDate && (
            <Button size="sm" variant="ghost" onClick={() => setFilterDate("")}>
              Next 7 days
            </Button>
          )}
          <Button size="sm" variant="solid" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Close form" : "Add screening"}
          </Button>
        </div>
      </div>

      {notice && <Status tone={notice.tone}>{notice.text}</Status>}

      {showForm && (
        <form className="mgr-form" onSubmit={createScreening}>
          <label>
            Movie
            <select
              name="movie_id"
              required
              defaultValue={prefilledMovie ?? activeMovies[0]?.movie_id}
            >
              {activeMovies.map((m) => (
                <option key={m.movie_id} value={m.movie_id}>
                  {m.title} ({m.duration_min} min)
                </option>
              ))}
            </select>
          </label>
          <label>
            Hall
            <select name="hall_id" required defaultValue={halls.data[0]?.hall_id}>
              {halls.data.map((h) => (
                <option key={h.hall_id} value={h.hall_id}>
                  {h.name} · {h.hall_type} ({h.capacity} seats)
                </option>
              ))}
            </select>
          </label>
          <label>
            Date (Almaty)
            <input type="date" name="date" required defaultValue={filterDate || almatyToday()} />
          </label>
          <label>
            Start time
            <input type="time" name="time" required defaultValue="19:00" />
          </label>
          <label>
            Base price (₸)
            <input type="number" name="base_price" required min={100} step={100} defaultValue={2500} />
          </label>
          <div className="mgr-form-actions">
            <Button type="submit" variant="solid" loading={busyId === "create"} disabled={busyId !== null}>
              Schedule screening
            </Button>
            <span className="muted small">Includes a 15-minute cleaning buffer after the movie ends.</span>
          </div>
        </form>
      )}

      {screenings.data.length === 0 ? (
        <EmptyState
          title="No screenings for this period"
          description="Use Add screening above to put a film into a hall."
        />
      ) : (
        <div className="mgr-table-wrap">
          <table className="mgr-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Movie</th>
                <th scope="col">Hall</th>
                <th scope="col" className="num">
                  Tickets
                </th>
                <th scope="col" className="num">
                  Base price (₸)
                </th>
                <th scope="col" className="num">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {screenings.data.map((s) => {
                const draft = priceDrafts[s.screening_id] ?? String(Math.round(Number(s.base_price)));
                const changed = Number(draft) !== Math.round(Number(s.base_price));
                const busy = busyId === s.screening_id;
                return (
                  <tr key={s.screening_id}>
                    <td>
                      <div>{when(s.start_time)}</div>
                      <small className="muted">{span(s)}</small>
                    </td>
                    <td>
                      <b>{s.movie_title}</b>
                    </td>
                    <td>
                      {s.hall.name} <Badge tone="neutral">{s.hall.hall_type}</Badge>
                    </td>
                    <td className="num">{s.tickets}</td>
                    <td className="num">
                      <input
                        aria-label={`Price for ${s.movie_title} at ${when(s.start_time)}`}
                        className="mgr-inline-input"
                        type="number"
                        min={100}
                        step={100}
                        value={draft}
                        onChange={(e) =>
                          setPriceDrafts((d) => ({ ...d, [s.screening_id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="num">
                      <span className="mgr-row-actions">
                        {changed && (
                          <Button
                            size="sm"
                            variant="solid"
                            loading={busy}
                            disabled={busy}
                            onClick={() => void savePrice(s.screening_id, String(s.base_price))}
                          >
                            Save ({price(draft)})
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || s.tickets > 0}
                          title={
                            s.tickets > 0
                              ? "Cannot delete a screening with held or sold tickets"
                              : "Delete screening"
                          }
                          onClick={() => void removeScreening(s.screening_id)}
                        >
                          Delete
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
