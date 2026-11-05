import { useEffect, useState } from "react";
import { api } from "./api/client";
import { AISLES, HALLS, MOVIES, ROWS, SEATS_PER_ROW, isTaken, runtime, seatKind, showtimes, tenge } from "./mock";
import type { Movie } from "./mock";

// PLACEHOLDER front-end (issue #17): looks like the finished app but runs on static mock data
// from ./mock. The real app shell (routing, login, API data) is issue #14 and replaces this.

type Status = "checking" | "ok" | "down";

const STATUS_LABEL: Record<Status, string> = {
  checking: "Checking…",
  ok: "Online",
  down: "Offline",
};

const DAYS = Array.from({ length: 5 }, (_, i) =>
  new Date(Date.now() + i * 864e5).toLocaleDateString("en-GB", {
    timeZone: "Asia/Almaty", weekday: "short", day: "numeric", month: "short",
  }),
);

function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
      // move focus to the new page's heading so keyboard and screen-reader users land on it
      requestAnimationFrame(() => document.querySelector<HTMLElement>("main h1")?.focus());
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
}

export default function App() {
  const [status, setStatus] = useState<Status>("checking");
  const [page, id, day, time, hall] = useRoute();
  const movie = MOVIES.find((m) => m.id === id);

  useEffect(() => {
    api
      .GET("/api/health")
      .then(({ data }) => setStatus(data?.status === "ok" ? "ok" : "down"))
      .catch(() => setStatus("down"));
  }, []);

  let view = <Home />;
  if (page === "movie" && movie) view = <MoviePage movie={movie} />;
  if (page === "seats" && movie) view = <Seats key={time} movie={movie} day={day} time={time} hall={Number(hall)} />;
  if (page === "bookings") view = <Bookings />;

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#/">Alatau Cinema</a>
        <nav aria-label="Main">
          <a href="#/" aria-current={page === "bookings" ? undefined : "page"}>Movies</a>
          <a href="#/bookings" aria-current={page === "bookings" ? "page" : undefined}>My bookings</a>
          <a className="btn btn-quiet" href="#/bookings">Log in</a>
        </nav>
      </header>

      <main>{view}</main>

      <footer className="footer">
        <p>Alatau Cinema · Almaty · 3 halls: 2D, 3D, IMAX</p>
        <p>Demo preview, mock data. University project, KBTU.</p>
        <p className="status" role="status">
          <span className={`mark mark-${status}`} aria-hidden="true" />
          API: {STATUS_LABEL[status]}
        </p>
      </footer>
    </div>
  );
}

function Poster({ movie }: { movie: Movie }) {
  const { bg, fg, shape } = movie.poster;
  return (
    <div className={`poster poster-${shape}`} style={{ "--p-bg": bg, "--p-fg": fg } as React.CSSProperties} aria-hidden="true">
      <span className="poster-age">{movie.age}</span>
      <span className="poster-title">{movie.title}</span>
    </div>
  );
}

function Home() {
  return (
    <>
      <div className="heading-row">
        <h1 tabIndex={-1}>Now showing</h1>
        <p className="muted">Today, {DAYS[0]} · times in Almaty</p>
      </div>
      <ul className="movies">
        {MOVIES.map((m, i) => (
          <li key={m.id} className="movie-card">
            <a href={`#/movie/${m.id}`} tabIndex={-1} aria-hidden="true"><Poster movie={m} /></a>
            <h2><a href={`#/movie/${m.id}`}>{m.title}</a></h2>
            <p className="meta"><span className="age">{m.age}</span>{m.genre} · {runtime(m.minutes)}</p>
            <p className="times">
              {showtimes(i)[0].times.slice(0, 3).map((t) => (
                <a key={t} className="time" href={`#/seats/${m.id}/0/${t}/0`}>{t}</a>
              ))}
            </p>
            <a className="btn" href={`#/movie/${m.id}`}>Book</a>
          </li>
        ))}
      </ul>
    </>
  );
}

function MoviePage({ movie }: { movie: Movie }) {
  const [day, setDay] = useState(0);
  return (
    <article className="movie-page">
      <Poster movie={movie} />
      <div>
        <a className="back" href="#/">All movies</a>
        <h1 tabIndex={-1}>{movie.title}</h1>
        <p className="meta"><span className="age">{movie.age}</span>{movie.genre} · {runtime(movie.minutes)} · English, Russian subtitles</p>
        <p className="synopsis">{movie.synopsis}</p>
        <h2>Showtimes</h2>
        <div className="days" role="group" aria-label="Day">
          {DAYS.map((d, i) => (
            <button key={d} type="button" aria-pressed={day === i} onClick={() => setDay(i)}>
              {i === 0 ? "Today" : d}
            </button>
          ))}
        </div>
        {showtimes(MOVIES.indexOf(movie)).map(({ hall, times }, h) => (
          <section key={hall.name} className="hall-times" aria-label={`${hall.name}, ${hall.format}`}>
            <h3>{hall.name} <span className="format">{hall.format}</span> <span className="muted">from {tenge(hall.price)}</span></h3>
            <p className="times">
              {times.map((t) => (
                <a key={t} className="time" href={`#/seats/${movie.id}/${day}/${t}/${h}`}>{t}</a>
              ))}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}

function Seats({ movie, day, time, hall }: { movie: Movie; day: string; time: string; hall: number }) {
  const h = HALLS[hall] ?? HALLS[0];
  const [picked, setPicked] = useState<string[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const price = (seat: string) => (seatKind(seat[0], Number(seat.slice(1))) === "vip" ? h.price * 1.5 : h.price);
  const seed = movie.id + day + time + hall;
  const label = (seat: string) => ({ standard: "", vip: " · VIP", wheelchair: " · Wheelchair" })[seatKind(seat[0], Number(seat.slice(1)))];

  useEffect(() => {
    if (left === null || left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const toggle = (seat: string) =>
    setPicked((p) => (p.includes(seat) ? p.filter((s) => s !== seat) : [...p, seat]));

  return (
    <div className="seats-page">
      <a className="back" href={`#/movie/${movie.id}`}>{movie.title}</a>
      <h1 tabIndex={-1}>Choose your seats</h1>
      <p className="meta">{DAYS[Number(day)] ?? DAYS[0]} · {time} · {h.name}, {h.format}</p>

      <div className="booking">
        <div className="hall">
          <div className="screen">Screen</div>
          <div className="seat-grid" role="group" aria-label="Seats">
            {ROWS.map((row) => (
              <div key={row} className="seat-row">
                <span className="row-label" aria-hidden="true">{row}</span>
                {Array.from({ length: SEATS_PER_ROW }, (_, i) => {
                  const n = i + 1;
                  const id = `${row}${n}`;
                  const kind = seatKind(row, n);
                  const taken = isTaken(seed, row, n);
                  const on = picked.includes(id);
                  return (
                    <button key={id} type="button" className={`seat seat-${kind}${taken ? " taken" : ""}${AISLES.includes(n) ? " aisle" : ""}`}
                      disabled={taken || left !== null} aria-pressed={on} onClick={() => toggle(id)}
                      aria-label={`Row ${row}, seat ${n}, ${kind === "vip" ? "VIP" : kind}, ${taken ? "taken" : on ? "selected" : "free"}`}>
                      {kind === "wheelchair" ? <WheelchairIcon /> : n}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <ul className="legend" aria-label="Legend">
            <li><span className="seat" />Free</li>
            <li><span className="seat picked" />Selected</li>
            <li><span className="seat taken" />Taken</li>
            <li><span className="seat seat-vip" />VIP ×1.5</li>
            <li><span className="seat seat-wheelchair"><WheelchairIcon /></span>Wheelchair</li>
          </ul>
        </div>

        <aside className="summary">
          <h2>Your seats</h2>
          {picked.length === 0 ? (
            <p className="muted">Pick free seats on the map.</p>
          ) : (
            <ul>
              {picked.map((s) => <li key={s}><span>Row {s[0]}, seat {s.slice(1)}{label(s)}</span><span>{tenge(price(s))}</span></li>)}
            </ul>
          )}
          <p className="total" aria-live="polite"><span>Total</span><span>{tenge(picked.reduce((sum, s) => sum + price(s), 0))}</span></p>
          {left === null ? (
            <button type="button" className="btn" disabled={picked.length === 0} onClick={() => setLeft(600)}>
              Hold seats for 10 minutes
            </button>
          ) : left === 0 ? (
            <>
              <p className="hold">The hold expired and the seats were released.</p>
              <button type="button" className="btn" onClick={() => setLeft(null)}>Choose seats again</button>
            </>
          ) : (
            <>
              <p className="hold">Held for you: <span className="timer" role="timer">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span></p>
              <button type="button" className="btn">Continue to payment</button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Bookings() {
  return (
    <div className="empty">
      <h1 tabIndex={-1}>My bookings</h1>
      <p className="muted">Log in to see your tickets and bookings.</p>
      <a className="btn" href="#/">Browse movies</a>
    </div>
  );
}

function WheelchairIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <path d="M11 7v6h5l2 5M8 10a6 6 0 1 0 7.5 7.5" />
    </svg>
  );
}
