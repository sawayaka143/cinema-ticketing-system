import { Link } from "react-router";
import { Status } from "../components/Layout";
import { useAuth } from "../lib/auth-context";

export function BookingsPage() {
  const { session, ready } = useAuth();

  return (
    <section className="panel">
      <h1>My bookings</h1>
      {!ready ? (
        <Status>Loading…</Status>
      ) : session ? (
        <Status>Your tickets will appear here after your first booking (week 12).</Status>
      ) : (
        <p>
          <Link to="/login">Log in</Link> to see your bookings.
        </p>
      )}
    </section>
  );
}
