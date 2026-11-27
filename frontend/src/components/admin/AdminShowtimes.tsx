import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { type AdminScreening, almatyIso, almatyToday, price, span } from "../../lib/format";
import { messageOf, must, useApi } from "../../lib/useApi";
import { Button, ErrorState, Skeleton } from "../ui";

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dayTitle = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Showtimes of one day: add one (movie, hall, time, price) or delete one that has no tickets. */
export function AdminShowtimes() {
  const [day, setDay] = useState(almatyToday());
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const list = useApi(
    () => api.GET("/api/admin/screenings", { params: { query: { date: day } } }).then(must),
    `admin-showtimes:${day}`,
  );

  async function remove(s: AdminScreening) {
    if (!window.confirm(`Delete the ${span(s)} showing of “${s.movie_title}” in ${s.hall.name}?`)) return;
    setBusyId(s.screening_id);
    setNotice(null);
    try {
      await api
        .DELETE("/api/admin/screenings/{screening_id}", { params: { path: { screening_id: s.screening_id } } })
        .then((res) => {
          if (!res.response.ok) must(res as { data?: unknown; error?: unknown; response: Response });
        });
      setNotice({ tone: "ok", text: `Showtime ${span(s)} deleted.` });
      list.reload();
    } catch (err) {
      setNotice({ tone: "error", text: messageOf(err) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <div className="admin-day">
          <button type="button" aria-label="Previous day" onClick={() => setDay(shift(day, -1))}>
            ←
          </button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button type="button" aria-label="Next day" onClick={() => setDay(shift(day, 1))}>
            →
          </button>
          <span className="admin-muted">{dayTitle.format(new Date(`${day}T00:00:00Z`))}</span>
        </div>
        <Button variant={adding ? "ghost" : "solid"} size="sm" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add showtime"}
        </Button>
      </div>

      {adding && (
        <ShowtimeForm
          day={day}
          onSaved={(s) => {
            setAdding(false);
            setNotice({ tone: "ok", text: `“${s.movie_title}” added at ${span(s)} in ${s.hall.name}.` });
            list.reload();
          }}
        />
      )}

      {notice && (
        <p className={notice.tone === "ok" ? "admin-ok" : "admin-error"} role={notice.tone === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}

      {list.state === "error" ? (
        <ErrorState
          title="Couldn't load showtimes"
          message="The showtimes for this day didn't load. Try again."
          details={list.message}
          onRetry={list.reload}
        />
      ) : list.state === "loading" ? (
        <Skeleton width="100%" height="12rem" radius={6} aria-busy="true" />
      ) : list.data.length === 0 ? (
        <p className="admin-muted">No showtimes on this day.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Movie</th>
              <th>Hall</th>
              <th className="num">Price</th>
              <th className="num">Tickets</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {list.data.map((s) => (
              <tr key={s.screening_id}>
                <td className="nowrap">{span(s)}</td>
                <td>{s.movie_title}</td>
                <td>
                  {s.hall.name} <small>{s.hall.hall_type}</small>
                </td>
                <td className="num">{price(s.base_price)}</td>
                <td className="num">{s.tickets}</td>
                <td className="actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(s)}
                    loading={busyId === s.screening_id}
                    disabled={s.tickets > 0}
                    title={s.tickets > 0 ? "Tickets are sold, so it can't be deleted" : undefined}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShowtimeForm({ day, onSaved }: { day: string; onSaved: (s: AdminScreening) => void }) {
  const movies = useApi(() => api.GET("/api/admin/movies").then(must), "admin-movies");
  const halls = useApi(() => api.GET("/api/admin/halls").then(must), "admin-halls");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const all = movies.state === "ready" ? movies.data : [];
  const typed = title.trim().toLowerCase();
  // The title is typed; an existing movie is matched by name (any case), otherwise it is a new one.
  const existing = typed ? all.find((m) => m.title.trim().toLowerCase() === typed) : undefined;
  const isNew = typed !== "" && !existing;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const value = (name: string) => String(f.get(name) ?? "");
    if (existing && !existing.is_active) {
      setError(`“${existing.title}” is archived. Restore it in Movies first.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const movieId = existing
        ? existing.movie_id
        : (
            await api
              .POST("/api/admin/movies", {
                body: {
                  title: title.trim(),
                  duration_min: Number(value("duration_min")),
                  min_age: Number(value("min_age")) as 0 | 6 | 12 | 16 | 18,
                  genres: [],
                },
              })
              .then(must)
          ).movie_id;
      if (isNew) movies.reload(); // the next showtime of this title finds it
      const s = await api
        .POST("/api/admin/screenings", {
          body: {
            movie_id: movieId,
            hall_id: Number(value("hall_id")),
            start_time: almatyIso(value("date"), value("time")),
            base_price: value("base_price"),
          },
        })
        .then(must);
      onSaved(s);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  if (movies.state !== "ready" || halls.state !== "ready") {
    return movies.state === "error" || halls.state === "error" ? (
      <p className="admin-error">Couldn&apos;t load movies or halls.</p>
    ) : (
      <Skeleton width="100%" height="6rem" radius={6} aria-busy="true" />
    );
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label className="wide">
        Movie title
        <input
          name="title"
          required
          maxLength={150}
          list="admin-movie-titles"
          autoComplete="off"
          placeholder="Type a title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <datalist id="admin-movie-titles">
          {all
            .filter((m) => m.is_active)
            .map((m) => (
              <option key={m.movie_id} value={m.title} />
            ))}
        </datalist>
        <small className="admin-hint">
          {existing
            ? existing.is_active
              ? `Existing movie · ${existing.duration_min} min · ${existing.min_age}+`
              : "This movie is archived. Restore it in Movies first."
            : isNew
              ? "New movie: it will be added to Movies with the length and age below."
              : "Start typing; existing movies are suggested."}
        </small>
      </label>
      {isNew && (
        <>
          <label>
            Length, min
            <input name="duration_min" type="number" required min={40} max={300} defaultValue={110} />
          </label>
          <label>
            Age
            <select name="min_age" defaultValue="12">
              {[0, 6, 12, 16, 18].map((a) => (
                <option key={a} value={a}>
                  {a}+
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Hall
        <select name="hall_id" required>
          {halls.data.map((h) => (
            <option key={h.hall_id} value={h.hall_id}>
              {h.name} · {h.hall_type}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date
        <input name="date" type="date" required defaultValue={day} />
      </label>
      <label>
        Start (Almaty)
        <input name="time" type="time" required defaultValue="19:00" />
      </label>
      <label>
        Price, ₸
        <input name="base_price" type="number" required min={10} step={10} defaultValue={2500} />
      </label>
      <div className="full admin-form-end">
        <small className="admin-muted">The end time is the movie length plus 15 minutes for cleaning.</small>
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="solid" size="sm" loading={busy}>
          Save showtime
        </Button>
      </div>
    </form>
  );
}
