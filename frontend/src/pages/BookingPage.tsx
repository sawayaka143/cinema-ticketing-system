import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import { type CardFieldRefs, CardPayment } from "../components/CardPayment";
import { KaspiQr } from "../components/KaspiQr";
import { Status } from "../components/Layout";
import { Button, Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { BUNDLE_LABEL_KEY, BUNDLE_PCT } from "../lib/bundles";
import "../components/bundle-hint.css";
import { type CardInput, EMPTY_CARD, validateCard } from "../lib/card";
import { type Booking, clock, price, when } from "../lib/format";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";
import { useCountdown } from "../lib/useCountdown";

const STATUS_TITLE_KEY: Record<Booking["status"], TranslationKey> = {
  pending: "booking.statusTitle.pending",
  paid: "booking.statusTitle.paid",
  cancelled: "booking.statusTitle.cancelled",
  expired: "booking.statusTitle.expired",
};

const TICKET_TYPE_KEY: Record<string, TranslationKey> = {
  adult: "ticket.adult",
  student: "ticket.student",
  child: "ticket.child",
  staff: "ticket.staff",
};

/** One booking: the live hold (countdown, total, cancel) or its final state. */
export function BookingPage() {
  const bookingId = Number(useParams().id);
  const { session, ready } = useAuth();
  const { t } = useI18n();
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
          title={t("booking.loginTitle")}
          description={t("booking.loginDesc")}
          action={
            <Button as={Link} to={`/login?next=${encodeURIComponent(`/bookings/${bookingId}`)}`} variant="solid">
              {t("nav.login")}
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
          title={t("booking.loadErrorTitle")}
          message={t("booking.loadErrorMsg")}
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
  const { t } = useI18n();
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
        <p className="kicker">{t("bookings.bookingNumber", { id: booking.booking_id })}</p>
        <h1>{t(STATUS_TITLE_KEY[booking.status])}</h1>

        {booking.status === "pending" && (
          <>
            <p className={`countdown${left <= 60 ? " urgent" : ""}`} role="timer" aria-live="off">
              {t("booking.heldFor")} <b>{clock(left)}</b>
            </p>
            {left === 60 && (
              <span className="sr-only" aria-live="polite">
                {t("booking.heldFor")} 1:00
              </span>
            )}
          </>
        )}

        <Tickets booking={booking} />

        {booking.status === "pending" && kaspi && (
          <KaspiQr
            booking={booking}
            onPaid={(latest) => {
              setKaspi(false);
              setBooking(latest);
            }}
            onBack={() => {
              setMessage(null);
              setKaspi(false);
            }}
          />
        )}

        {booking.status === "pending" && !kaspi && (
          <PayForm
            busy={busy}
            total={booking.total_amount}
            onPay={(method, decline) => {
              if (method === "kaspi") {
                setMessage(null);
                setKaspi(true);
              } else {
                void pay(method, decline);
              }
            }}
            onCancel={cancel}
          />
        )}

        {booking.status === "paid" && <PaidTickets booking={booking} />}

        {(booking.status === "cancelled" || booking.status === "expired") && (
          <p>
            {booking.status === "expired" ? t("booking.expiredHint") : t("booking.cancelledHint")}{" "}
            {screeningId ? (
              <Button variant="link" onClick={() => navigate(`/screenings/${screeningId}`)}>
                {t("booking.pickAgain")}
              </Button>
            ) : (
              <Link to="/">{t("booking.backHome")}</Link>
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
  total,
  onPay,
  onCancel,
}: {
  busy: boolean;
  total: string;
  onPay: (method: "card" | "kaspi", simulateDecline: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [method, setMethod] = useState<"card" | "kaspi">("card");
  const [decline, setDecline] = useState(false);
  // Card details live only in this form: the API is told the method, never the card.
  const [card, setCard] = useState<CardInput>(EMPTY_CARD);
  const [tried, setTried] = useState(false);
  const refs: CardFieldRefs = {
    number: useRef(null),
    name: useRef(null),
    expiry: useRef(null),
    cvc: useRef(null),
  };
  // Errors appear after the first pay attempt, then follow the typing.
  const errors = tried ? validateCard(card) : {};

  function submit() {
    if (method === "card") {
      const found = validateCard(card);
      const first = (Object.keys(EMPTY_CARD) as (keyof CardInput)[]).find((key) => found[key]);
      if (first) {
        setTried(true);
        refs[first].current?.focus();
        return;
      }
    }
    onPay(method, decline);
  }

  return (
    <form
      className="pay"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset>
        <legend>{t("booking.payWith")}</legend>
        {(["card", "kaspi"] as const).map((m) => (
          <label key={m} className="choice">
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
            {m === "card" ? t("booking.bankCard") : t("booking.kaspi")}
          </label>
        ))}
      </fieldset>
      {method === "card" ? (
        <>
          <CardPayment card={card} onChange={setCard} errors={errors} disabled={busy} refs={refs} />
          <label className="choice muted small">
            <input type="checkbox" checked={decline} onChange={(e) => setDecline(e.target.checked)} />
            {t("booking.demoDecline")}
          </label>
        </>
      ) : (
        <>
          <p className="muted small">{t("booking.kaspiHint")}</p>
          <p className="muted small">{t("booking.simulatedNote")}</p>
        </>
      )}
      <div className="actions">
        <Button type="submit" variant="solid" loading={busy} disabled={busy}>
          {busy
            ? t("booking.processingPayment")
            : method === "kaspi"
              ? t("booking.showKaspiQr")
              : t("booking.payAmount", { amount: price(total) })}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t("booking.cancelFree")}
        </Button>
      </div>
    </form>
  );
}

function PaidTickets({ booking }: { booking: Booking }) {
  const { locale, t } = useI18n();
  return (
    <div className="paid">
      <QrCode bookingId={booking.booking_id} />
      <div>
        <p>{t("booking.showCodeHint")}</p>
        {booking.checked_in_at && <p className="muted">{t("booking.checkedInAt", { when: when(booking.checked_in_at, locale) })}</p>}
        <Link to="/me/bookings">{t("booking.allMyBookings")}</Link>
      </div>
    </div>
  );
}

/** The QR image needs the login token, so it is fetched as a blob instead of a plain image URL. */
function QrCode({ bookingId }: { bookingId: number }) {
  const { t } = useI18n();
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
        title={t("booking.qrErrorTitle")}
        message={qr.message}
        onRetry={qr.reload}
      />
    );
  }
  return <img className="qr" src={qr.data} alt={`QR code for booking ${bookingId}`} width={200} height={200} />;
}

function Tickets({ booking }: { booking: Booking }) {
  const { t } = useI18n();
  if (booking.tickets.length === 0) return null;
  return (
    <table className="tickets">
      <thead>
        <tr>
          <th scope="col">{t("booking.colSeat")}</th>
          <th scope="col">{t("booking.colTicket")}</th>
          <th scope="col" className="num">
            {t("booking.colPrice")}
          </th>
        </tr>
      </thead>
      <tbody>
        {booking.tickets.map((tk) => (
          <tr key={tk.ticket_id}>
            <td>{t("screening.rowSeat", { row: tk.row_label, seat: tk.seat_number })}</td>
            <td className="cap">
              {TICKET_TYPE_KEY[tk.ticket_type] ? t(TICKET_TYPE_KEY[tk.ticket_type]) : tk.ticket_type}
            </td>
            <td className="num">{price(tk.price)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        {booking.bundle && Number(booking.bundle_saving) > 0 && (
          <tr className="bundle-row">
            <th scope="row" colSpan={2}>
              {t(BUNDLE_LABEL_KEY[booking.bundle])} −{BUNDLE_PCT[booking.bundle]}%
            </th>
            <td className="num">−{price(booking.bundle_saving)}</td>
          </tr>
        )}
        <tr>
          <th scope="row" colSpan={2}>
            {t("booking.total")}
          </th>
          <td className="num">
            <b>{price(booking.total_amount)}</b>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
