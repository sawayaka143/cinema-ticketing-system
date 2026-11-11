import { Link } from "react-router";
import { api } from "../api/client";
import { Badge, Button, Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
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
    <FadeIn direction="up">
      <section className="panel">
        <h1>My bookings</h1>
        {!ready ? (
          <div className="my-bookings" aria-busy="true">
            <Skeleton width="100%" height="4rem" radius={12} />
            <Skeleton width="100%" height="4rem" radius={12} />
            <Skeleton width="100%" height="4rem" radius={12} />
          </div>
        ) : !session ? (
          <EmptyState
            title="Log in to see your bookings"
            description="Sign in to view your held seats, paid QR tickets, and booking history."
            action={
              <Button as={Link} to="/login" variant="solid">
                Log in
              </Button>
            }
          />
        ) : list.state === "loading" ? (
          <div className="my-bookings" aria-busy="true">
            <Skeleton width="100%" height="4rem" radius={12} />
            <Skeleton width="100%" height="4rem" radius={12} />
            <Skeleton width="100%" height="4rem" radius={12} />
          </div>
        ) : list.state === "error" ? (
          <ErrorState
            title="Couldn't load your bookings"
            message="We had trouble retrieving your booking history. Please try again."
            details={list.message}
            onRetry={list.reload}
          />
        ) : list.data.length === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="Pick a movie and choose your seats on the hall map."
            action={
              <Button as={Link} to="/" variant="solid">
                Find a movie
              </Button>
            }
          />
        ) : (
          <ul className="my-bookings">
            {list.data.map((b) => (
              <Card
                key={b.booking_id}
                as="li"
                elevated={b.status === "paid" || b.status === "pending"}
                className={b.status === "paid" || b.status === "pending" ? "booking-item" : "booking-item done"}
              >
                <Link to={`/bookings/${b.booking_id}`}>
                  {/* Cancelled and expired bookings lost their tickets, so movie, hall and time are null. */}
                  <b>{b.movie_title ?? `Booking #${b.booking_id}`}</b>
                  <span className="muted">
                    {b.start_time ? when(b.start_time) : `Booked ${when(b.booking_time)}`}
                    {b.hall && ` · ${b.hall}`}
                    {b.tickets.length > 0 && ` · ${b.tickets.length} seat${b.tickets.length > 1 ? "s" : ""}`}
                  </span>
                </Link>
                <Badge tone={b.status === "paid" ? "accent" : "neutral"}>{LABEL[b.status]}</Badge>
                {b.tickets.length > 0 && <span className="num">{price(b.total_amount)}</span>}
              </Card>
            ))}
          </ul>
        )}
      </section>
    </FadeIn>
  );
}
