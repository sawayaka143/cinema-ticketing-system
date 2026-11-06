import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { useAuth } from "../lib/auth-context";
import { type Booking, clock, price } from "../lib/format";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";

/** One booking: the live hold (countdown, total, cancel) or its final state. */
export function BookingPage() {
  const bookingId = Number(useParams().id);
  const { session, ready } = useAuth();
  const [reload, setReload] = useState(0);
  const page = useApi(
    () => api.GET("/api/bookings/{booking_id}", { params: { path: { booking_id: bookingId } } }).then(must),
    `${bookingId}:${reload}:${session ? 1 : 0}`,
  );

  if (!ready) return <Status>Loading…</Status>;
  if (!session)
    return (
      <Status>
        <Link to="/login">Log in</Link> to see this booking.
      </Status>
    );
  if (page.state === "loading") return <Status>Loading…</Status>;
  if (page.state === "error") return <Status tone="error">{page.message}</Status>;

  return <BookingView key={reload} booking={page.data} refresh={() => setReload((n) => n + 1)} />;
}

function BookingView({ booking: initial, refresh }: { booking: Booking; refresh: () => void }) {
  const navigate = useNavigate();
  const [booking, setBooking] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const left = useCountdown(booking.status === "pending" ? booking.seconds_left : 0);

  // The hold ran out on screen: ask the API, which marks it expired and frees the seats.
  useEffect(() => {
    // Only when it counted down here, so a stale "0 seconds left" answer can't loop.
    if (booking.status === "pending" && initial.seconds_left > 0 && left === 0) refresh();
  }, [booking.status, initial.seconds_left, left, refresh]);

  const path = { params: { path: { booking_id: booking.booking_id } } };
  const screeningId = booking.tickets[0]?.screening_id;

  async function cancel() {
    setBusy(true);
    setMessage(null);
    try {
      setBooking(await api.POST("/api/bookings/{booking_id}/cancel", path).then(must));
    } catch (err) {
      setMessage(messageOf(err));
      if (statusOf(err) === 409) refresh();
    }
    setBusy(false);
  }

  return (
    <section className="panel">
      <p className="kicker">Booking #{booking.booking_id}</p>
      <h1>{TITLE[booking.status]}</h1>

      {booking.status === "pending" && (
        <p className={`countdown${left <= 60 ? " urgent" : ""}`} role="timer" aria-live="off">
          Seats held for <b>{clock(left)}</b>
        </p>
      )}

      <Tickets booking={booking} />

      {booking.status === "pending" && (
        <div className="actions">
          <button type="button" className="ghost" disabled={busy} onClick={cancel}>
            Cancel and free the seats
          </button>
        </div>
      )}

      {(booking.status === "cancelled" || booking.status === "expired") && (
        <p>
          {booking.status === "expired"
            ? "The 10 minutes ran out, so the seats are free again."
            : "The seats are free again."}{" "}
          {screeningId ? (
            <button type="button" className="link" onClick={() => navigate(`/screenings/${screeningId}`)}>
              Pick seats again
            </button>
          ) : (
            <Link to="/">Back to what&apos;s on</Link>
          )}
        </p>
      )}

      {message && <Status tone="error">{message}</Status>}
    </section>
  );
}

const TITLE: Record<Booking["status"], string> = {
  pending: "Your seats are on hold",
  paid: "Your tickets",
  cancelled: "Booking cancelled",
  expired: "Hold expired",
};

function Tickets({ booking }: { booking: Booking }) {
  if (booking.tickets.length === 0) return null;
  return (
    <table className="tickets">
      <thead>
        <tr>
          <th scope="col">Seat</th>
          <th scope="col">Ticket</th>
          <th scope="col" className="num">
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        {booking.tickets.map((t) => (
          <tr key={t.ticket_id}>
            <td>
              Row {t.row_label}, seat {t.seat_number}
            </td>
            <td className="cap">{t.ticket_type}</td>
            <td className="num">{price(t.price)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2}>
            Total
          </th>
          <td className="num">
            <b>{price(booking.total_amount)}</b>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Seconds left, ticking once a second. Based on the API's seconds_left, so the device clock doesn't matter. */
function useCountdown(seconds: number) {
  const [deadline] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
