import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import { KaspiQr } from "../components/KaspiQr";
import { Status } from "../components/Layout";
import { Button, Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { type Booking, clock, price, when } from "../lib/format";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";
import { useCountdown } from "../lib/useCountdown";

/** One booking: the live hold (countdown, total, cancel) or its final state. */
export function BookingPage() {
  const bookingId = Number(useParams().id);
  const { session, ready } = useAuth();
  const [reload, setReload] = useState(0);
  const page = useApi(
    () => api.GET("/api/bookings/{booking_id}", { params: { path: { booking_id: bookingId } } }).then(must),
    `${bookingId}:${reload}:${session ? 1 : 0}`,
  );

  if (!ready) {
    return (
      <Card as="section" elevated className="panel" aria-busy="true">
        <Skeleton width="7rem" height="1rem" radius={6} />
        <Skeleton width="16rem" height="2rem" radius={8} style={{ marginTop: "0.5rem" }} />
        <Skeleton width="100%" height="8rem" radius={10} style={{ marginTop: "1.5rem" }} />
      </Card>
    );
  }

  if (!session) {
    return (
      <FadeIn direction="up">
        <EmptyState
          title="Log in to see this booking"
          description="Please sign in with the account that placed this booking."
          action={
            <Button as={Link} to="/login" variant="solid">
              Log in
            </Button>
          }
        />
      </FadeIn>
    );
  }

  if (page.state === "loading") {
    return (
      <Card as="section" elevated className="panel" aria-busy="true">
        <Skeleton width="7rem" height="1rem" radius={6} />
        <Skeleton width="16rem" height="2rem" radius={8} style={{ marginTop: "0.5rem" }} />
        <Skeleton width="100%" height="8rem" radius={10} style={{ marginTop: "1.5rem" }} />
      </Card>
    );
  }

  if (page.state === "error") {
    return (
      <FadeIn direction="up">
        <ErrorState
          title="Couldn't load this booking"
          message="We couldn't retrieve the booking details. Please try again."
          details={page.message}
          onRetry={page.reload}
        />
      </FadeIn>
    );
  }

  return <BookingView key={reload} booking={page.data} refresh={() => setReload((n) => n + 1)} />;
}

function BookingView({ booking: initial, refresh }: { booking: Booking; refresh: () => void }) {
  const navigate = useNavigate();
  const [booking, setBooking] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kaspi, setKaspi] = useState(false);
  const left = useCountdown(booking.status === "pending" ? booking.seconds_left : 0);

  // The hold ran out on screen: ask the API, which marks it expired and frees the seats.
  useEffect(() => {
    // Only when it counted down here, so a stale "0 seconds left" answer can't loop.
    if (booking.status === "pending" && initial.seconds_left > 0 && left === 0) refresh();
  }, [booking.status, initial.seconds_left, left, refresh]);

  const path = { params: { path: { booking_id: booking.booking_id } } };
  // From the first load: a cancelled or expired booking comes back without tickets.
  const screeningId = initial.tickets[0]?.screening_id;

  async function pay(method: "card" | "kaspi", simulateDecline: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const body = { method, simulate_decline: simulateDecline };
      setBooking(await api.POST("/api/bookings/{booking_id}/pay", { ...path, body }).then(must));
    } catch (err) {
      const status = statusOf(err);
      // 402: declined, the hold stays, so the customer can try again. 409: hold expired or already paid.
      setMessage(status === 402 ? `${messageOf(err)}.` : messageOf(err));
      if (status === 409) refresh();
    }
    setBusy(false);
  }

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
    <FadeIn direction="up">
      <Card as="section" elevated className="panel">
        <p className="kicker">Booking #{booking.booking_id}</p>
        <h1>{TITLE[booking.status]}</h1>

        {booking.status === "pending" && (
          <p className={`countdown${left <= 60 ? " urgent" : ""}`} role="timer" aria-live="off">
            Seats held for <b>{clock(left)}</b>
          </p>
        )}

        <Tickets booking={booking} />

        {booking.status === "pending" && kaspi && (
          <KaspiQr
            booking={booking}
            onPaid={(latest) => {
              setKaspi(false);
              setBooking(latest);
            }}
            onBack={() => setKaspi(false)}
          />
        )}

        {booking.status === "pending" && !kaspi && (
          <PayForm
            busy={busy}
            onPay={(method, decline) => (method === "kaspi" ? setKaspi(true) : void pay(method, decline))}
            onCancel={cancel}
          />
        )}

        {booking.status === "paid" && <PaidTickets booking={booking} />}

        {(booking.status === "cancelled" || booking.status === "expired") && (
          <p>
            {booking.status === "expired"
              ? "The 10 minutes ran out, so the seats are free again."
              : "The seats are free again."}{" "}
            {screeningId ? (
              <Button variant="link" onClick={() => navigate(`/screenings/${screeningId}`)}>
                Pick seats again
              </Button>
            ) : (
              <Link to="/">Back to what&apos;s on</Link>
            )}
          </p>
        )}

        {message && <Status tone="error">{message}</Status>}
      </Card>
    </FadeIn>
  );
}

function PayForm({
  busy,
  onPay,
  onCancel,
}: {
  busy: boolean;
  onPay: (method: "card" | "kaspi", simulateDecline: boolean) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<"card" | "kaspi">("card");
  const [decline, setDecline] = useState(false);
  return (
    <form
      className="pay"
      onSubmit={(e) => {
        e.preventDefault();
        onPay(method, decline);
      }}
    >
      <fieldset>
        <legend>Pay with</legend>
        {(["card", "kaspi"] as const).map((m) => (
          <label key={m} className="choice">
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
            {m === "card" ? "Bank card" : "Kaspi"}
          </label>
        ))}
      </fieldset>
      {method === "card" ? (
        <label className="choice muted small">
          <input type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} />
          Demo: make the bank decline this payment
        </label>
      ) : (
        <p className="muted small">You will get a QR code to scan with your phone, or to tap if you are on one.</p>
      )}
      <p className="muted small">Payment is simulated. No real money is charged.</p>
      <div className="actions">
        <Button type="submit" variant="solid" loading={busy} disabled={busy}>
          {busy ? "Please wait…" : method === "kaspi" ? "Show Kaspi QR" : "Pay now"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel and free the seats
        </Button>
      </div>
    </form>
  );
}

function PaidTickets({ booking }: { booking: Booking }) {
  return (
    <div className="paid">
      <QrCode bookingId={booking.booking_id} />
      <div>
        <p>Show this code at the entrance. One code lets the whole group in.</p>
        {booking.checked_in_at && <p className="muted">Checked in at {when(booking.checked_in_at)}.</p>}
        <Link to="/me/bookings">All my bookings</Link>
      </div>
    </div>
  );
}

/** The QR image needs the login token, so it is fetched as a blob instead of a plain image URL. */
function QrCode({ bookingId }: { bookingId: number }) {
  const qr = useApi(async () => {
    const res = await api.GET("/api/bookings/{booking_id}/qr.png", {
      params: { path: { booking_id: bookingId } },
      parseAs: "blob",
    });
    if (!res.data) throw new Error("Could not load the QR code");
    const blob = res.data;
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the QR code"));
      reader.readAsDataURL(blob);
    });
  }, bookingId);

  if (qr.state === "loading") return <Skeleton width={200} height={200} radius={12} />;
  if (qr.state === "error") {
    return (
      <ErrorState
        title="Couldn't load QR code"
        message={qr.message}
        onRetry={qr.reload}
      />
    );
  }
  return <img className="qr" src={qr.data} alt={`QR code for booking ${bookingId}`} width={200} height={200} />;
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
