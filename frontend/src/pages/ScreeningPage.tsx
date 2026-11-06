import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { SeatMap } from "../components/SeatMap";
import { useAuth } from "../lib/auth-context";
import { price, span, type Seat } from "../lib/format";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";

const MAX_SEATS = 10;

export function ScreeningPage() {
  const screeningId = Number(useParams().id);
  const navigate = useNavigate();
  const { session, ready } = useAuth();
  // Bumping `reload` refetches the seat map (after a 409, someone else took a seat).
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const page = useApi(async () => {
    const path = { params: { path: { screening_id: screeningId } } };
    const [detail, map] = await Promise.all([
      api.GET("/api/screenings/{screening_id}", path).then(must),
      api.GET("/api/screenings/{screening_id}/seats", path).then(must),
    ]);
    return { detail, map };
  }, `${screeningId}:${reload}`);

  // Ticket types allowed for this movie (age limit) and this user (staff); depends on login.
  const types = useApi(
    () =>
      api.GET("/api/ticket-types", { params: { query: { screening_id: screeningId } } }).then(must),
    `${screeningId}:${session?.user.id ?? "anon"}`,
  );

  if (page.state === "error") return <Status tone="error">{page.message}</Status>;
  if (page.state === "loading") return <Status>Loading…</Status>;
  const { detail: s, map } = page.data;
  const seatById = new Map(map.seats.map((seat) => [seat.seat_id, seat]));
  const chosen = [...picked.keys()].map((id) => seatById.get(id)).filter((x): x is Seat => !!x && !x.is_taken);
  const typeNames = types.state === "ready" ? types.data.map((t) => t.name) : ["adult"];

  function toggle(seat: Seat) {
    setMessage(null);
    const next = new Map(picked);
    if (next.has(seat.seat_id)) next.delete(seat.seat_id);
    else if (next.size >= MAX_SEATS) {
      setMessage({ tone: "error", text: `You can pick up to ${MAX_SEATS} seats at once.` });
      return;
    } else next.set(seat.seat_id, "adult");
    setPicked(next);
  }

  function setType(seatId: number, type: string) {
    setPicked(new Map(picked).set(seatId, type));
  }

  async function hold() {
    setBusy(true);
    setMessage(null);
    try {
      const ids = chosen.map((seat) => seat.seat_id);
      const ticketTypes = Object.fromEntries(
        ids.map((id) => [String(id), picked.get(id) ?? "adult"]).filter(([, t]) => t !== "adult"),
      );
      const booking = await api
        .POST("/api/bookings", { body: { screening_id: screeningId, seat_ids: ids, ticket_types: ticketTypes } })
        .then(must);
      navigate(`/bookings/${booking.booking_id}`);
    } catch (err) {
      if (statusOf(err) === 409) {
        // Someone else was faster: drop the stale picks and show the fresh map.
        setPicked(new Map());
        setReload((n) => n + 1);
        setMessage({
          tone: "error",
          text: `${messageOf(err)}. The map is updated, please pick again.`,
        });
      } else {
        setMessage({ tone: "error", text: messageOf(err) });
      }
      setBusy(false);
    }
  }

  return (
    <section>
      <p className="kicker">
        <Link to={`/movies/${s.movie.movie_id}`}>{s.movie.title}</Link>
      </p>
      <h1>
        {s.hall.name} · {s.hall.hall_type}
      </h1>
      <p className="meta">
        {span(s)} · from {price(s.base_price)}
      </p>

      <div className="booking-layout">
        <SeatMap seats={map.seats} picked={new Set(picked.keys())} onToggle={toggle} disabled={busy} />

        <aside className="basket" aria-label="Your seats">
          <h2>Your seats</h2>
          {chosen.length === 0 ? (
            <p className="muted">Tap free seats on the map. Up to {MAX_SEATS} per booking.</p>
          ) : (
            <ul className="picks">
              {chosen.map((seat) => (
                <li key={seat.seat_id}>
                  <span>
                    Row {seat.row_label}, seat {seat.seat_number}
                    {seat.seat_type !== "standard" && <small> · {seat.seat_type}</small>}
                  </span>
                  <label>
                    <span className="sr-only">
                      Ticket type for row {seat.row_label}, seat {seat.seat_number}
                    </span>
                    <select
                      value={picked.get(seat.seat_id)}
                      onChange={(e) => setType(seat.seat_id, e.target.value)}
                      disabled={busy}
                    >
                      {typeNames.map((t) => (
                        <option key={t} value={t}>
                          {t[0].toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {types.state === "ready" && types.data.some((t) => Number(t.discount_pct) > 0) && (
            <p className="muted small">
              Discounts:{" "}
              {types.data
                .filter((t) => Number(t.discount_pct) > 0)
                .map((t) => `${t.name} −${Number(t.discount_pct)}%`)
                .join(", ")}
              . The exact total is shown after the hold.
            </p>
          )}
          {!ready ? null : session ? (
            <button type="button" className="solid wide" disabled={busy || chosen.length === 0} onClick={hold}>
              {busy ? "Holding seats…" : chosen.length ? `Hold ${chosen.length} seat${chosen.length > 1 ? "s" : ""} for 10 min` : "Pick seats"}
            </button>
          ) : (
            <Link to="/login" className="solid wide">
              Log in to book
            </Link>
          )}
          {message && <Status tone={message.tone}>{message.text}</Status>}
        </aside>
      </div>
    </section>
  );
}
