import { type FormEvent, lazy, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { SeatMap } from "../components/SeatMap";
import { Button, Card, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { price, span, type Seat } from "../lib/format";
import { screeningKey } from "../lib/catalogCache";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";

const MAX_SEATS = 10;

// Three.js is large, so the 3D hall is its own chunk, fetched after the page itself has shown.
const HallView3D = lazy(() => import("../components/HallView3D"));

export function ScreeningPage() {
  const screeningId = Number(useParams().id);
  const navigate = useNavigate();
  const { session, ready } = useAuth();
  // Bumping `reload` refetches the seat map (after a 409, someone else took a seat).
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  // A login without a customer profile (e.g. made in the Supabase dashboard) can't book yet.
  const [needsProfile, setNeedsProfile] = useState(false);

  const path = { params: { path: { screening_id: screeningId } } };
  // Film, hall and time rarely change, so they come from the cache first; seats never do.
  const detail = useApi(
    () => api.GET("/api/screenings/{screening_id}", path).then(must),
    screeningId,
    screeningKey(screeningId),
  );
  const seats = useApi(
    () => api.GET("/api/screenings/{screening_id}/seats", path).then(must),
    `${screeningId}:${reload}`,
  );

  // Ticket types allowed for this movie (age limit) and this user (staff); depends on login.
  const types = useApi(
    () =>
      api.GET("/api/ticket-types", { params: { query: { screening_id: screeningId } } }).then(must),
    `${screeningId}:${session?.user.id ?? "anon"}`,
  );

  if (detail.state === "error" || seats.state === "error") {
    const failed = detail.state === "error" ? detail : seats;
    return (
      <FadeIn direction="up">
        <ErrorState
          title="Couldn't load the hall"
          message="We couldn't load the seat map for this screening. Please try again."
          details={failed.state === "error" ? failed.message : undefined}
          onRetry={failed.reload}
        />
      </FadeIn>
    );
  }

  if (detail.state === "loading") {
    return (
      <section aria-busy="true">
        <Skeleton width="10rem" height="1rem" radius={6} />
        <Skeleton width="18rem" height="2.25rem" radius={8} style={{ marginTop: "0.5rem" }} />
        <Skeleton width="14rem" height="1.125rem" radius={6} style={{ marginTop: "0.5rem" }} />
        <div className="booking-layout">
          <Skeleton width="100%" height="18rem" radius={14} />
          <Card as="aside" elevated className="basket">
            <Skeleton width="8rem" height="1.5rem" radius={6} />
            <Skeleton width="100%" height="3rem" radius={8} style={{ marginTop: "0.75rem" }} />
            <Skeleton width="100%" height="2.75rem" radius={12} style={{ marginTop: "0.75rem" }} />
          </Card>
        </div>
      </section>
    );
  }

  const s = detail.data;
  const map = seats.state === "ready" ? seats.data : null;
  const seatById = new Map((map?.seats ?? []).map((seat) => [seat.seat_id, seat]));
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
      } else if (statusOf(err) === 403 && messageOf(err).includes("customer profile")) {
        setNeedsProfile(true);
      } else {
        setMessage({ tone: "error", text: messageOf(err) });
      }
      setBusy(false);
    }
  }

  async function saveProfileAndHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = String(new FormData(event.currentTarget).get("full_name") ?? "").trim();
    setBusy(true);
    setMessage(null);
    try {
      await api.POST("/api/me/customer", { body: { full_name: fullName } }).then(must);
      setNeedsProfile(false);
      await hold();
    } catch (err) {
      setMessage({ tone: "error", text: messageOf(err) });
      setBusy(false);
    }
  }

  return (
    <FadeIn direction="up">
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
          <div className="hall-panel">
            {!map ? (
              <Skeleton width="100%" height="30rem" radius={18} aria-busy="true" />
            ) : (
              <Suspense fallback={<Skeleton width="100%" height="30rem" radius={18} aria-busy="true" />}>
                <HallView3D
                  seats={map.seats}
                  picked={new Set(picked.keys())}
                  onToggle={toggle}
                  disabled={busy}
                  fallback={
                    <SeatMap seats={map.seats} picked={new Set(picked.keys())} onToggle={toggle} disabled={busy} />
                  }
                />
              </Suspense>
            )}
          </div>

          <Card as="aside" elevated className="basket" aria-label="Your seats">
            <h2>Your seats</h2>
            {chosen.length === 0 ? (
              <p className="muted">Tap a seat in the hall to see the screen from it, then pick it. Up to {MAX_SEATS} per booking.</p>
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
            {needsProfile ? (
              <form className="form profile" onSubmit={saveProfileAndHold}>
                <p>One more step: the name for your tickets.</p>
                <label>
                  Full name
                  <input name="full_name" autoComplete="name" required maxLength={100} />
                </label>
                <Button type="submit" variant="solid" className="wide" loading={busy} disabled={busy}>
                  {busy ? "Holding seats…" : "Save and hold seats"}
                </Button>
              </form>
            ) : !ready ? null : session ? (
              <Button
                type="button"
                variant="solid"
                className="wide"
                loading={busy}
                disabled={busy || chosen.length === 0}
                onClick={hold}
              >
                {busy
                  ? "Holding seats…"
                  : chosen.length
                    ? `Hold ${chosen.length} seat${chosen.length > 1 ? "s" : ""} for 10 min`
                    : "Pick seats"}
              </Button>
            ) : (
              <Button as={Link} to="/login" variant="solid" className="wide">
                Log in to book
              </Button>
            )}
            {message && <Status tone={message.tone}>{message.text}</Status>}
          </Card>
        </div>
      </section>
    </FadeIn>
  );
}
