import { Link } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { useAuth } from "../lib/auth-context";
import { type MyBooking, price, when } from "../lib/format";
import { must, useApi } from "../lib/useApi";

const LABEL: Record<MyBooking["status"], string> = {
  pending: "On hold",
  paid: "Paid",
  cancelled: "Cancelled",
  expired: "Expired",
};

export function BookingsPage() {
  const { session, ready } = useAuth();
  const list = useApi(() => api.GET("/api/me/bookings").then(must), session?.user.id ?? "anon");

  return (
    <section className="panel">
      <h1>My bookings</h1>
      {!ready ? (
        <Status>Loading…</Status>
      ) : !session ? (
        <p>
          <Link to="/login">Log in</Link> to see your bookings.
        </p>
      ) : list.state === "loading" ? (
        <Status>Loading…</Status>
      ) : list.state === "error" ? (
        <Status tone="error">{list.message}</Status>
      ) : list.data.length === 0 ? (
        <p>
          No bookings yet. <Link to="/">Find a movie</Link> and pick your seats.
        </p>
      ) : (
        <ul className="my-bookings">
          {list.data.map((b) => (
            <li key={b.booking_id} className={b.status === "paid" || b.status === "pending" ? "" : "done"}>
              <Link to={`/bookings/${b.booking_id}`}>
                {/* Cancelled and expired bookings lost their tickets, so movie, hall and time are null. */}
                <b>{b.movie_title ?? `Booking #${b.booking_id}`}</b>
                <span className="muted">
                  {b.start_time ? when(b.start_time) : `Booked ${when(b.booking_time)}`}
                  {b.hall && ` · ${b.hall}`}
                  {b.tickets.length > 0 && ` · ${b.tickets.length} seat${b.tickets.length > 1 ? "s" : ""}`}
                </span>
              </Link>
              <span className={`badge badge-${b.status}`}>{LABEL[b.status]}</span>
              {b.tickets.length > 0 && <span className="num">{price(b.total_amount)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
