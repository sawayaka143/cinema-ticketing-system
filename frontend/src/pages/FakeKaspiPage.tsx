import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../api/client";
import type { components } from "../api/schema";
import { Badge, BrandMark, Button, Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { clock, price, when } from "../lib/format";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";
import { useCountdown } from "../lib/useCountdown";

type Invoice = components["schemas"]["FakeKaspiOut"];

/**
 * Demo "Kaspi" pay page (#99), opened from the QR code on a phone. No login: the link token is
 * the access. It imitates the real flow without the bank's name or logo, and says it is a demo.
 */
export function FakeKaspiPage() {
  const token = useParams().token ?? "";
  const bookingId = Number(useSearchParams()[0].get("b")) || null;
  const page = useApi(
    () => api.GET("/api/fake-kaspi/{token}", { params: { path: { token } } }).then(must),
    token,
  );

  return (
    <main className="fake-kaspi">
      <header className="fake-kaspi-bar">
        <span className="fake-kaspi-logo" aria-hidden="true">
          ₸
        </span>
        <span>
          <b>QR Pay</b> <span className="fake-kaspi-demo">demo</span>
        </span>
      </header>

      {page.state === "loading" && (
        <Card elevated className="fake-kaspi-card" aria-busy="true">
          <Skeleton width="8rem" height="1rem" radius={6} />
          <Skeleton width="12rem" height="2.5rem" radius={8} style={{ marginTop: "0.75rem" }} />
          <Skeleton width="100%" height="6rem" radius={12} style={{ marginTop: "1.5rem" }} />
          <Skeleton width="100%" height="3rem" radius={14} style={{ marginTop: "1.5rem" }} />
        </Card>
      )}

      {page.state === "error" &&
        (page.message.includes("Unknown payment link") ? (
          <EmptyState
            title="This payment link doesn't exist"
            description="Scan the QR code on the cinema site again."
          />
        ) : (
          <ErrorState
            title="Couldn't open the payment"
            message="We couldn't reach the payment service. Please try again."
            details={page.message}
            onRetry={page.reload}
          />
        ))}

      {page.state === "ready" && (
        <PayView key={`${page.data.status}:${page.data.seconds_left}`} token={token} bookingId={bookingId} initial={page.data} />
      )}

      <p className="fake-kaspi-note">
        Demo of a Kaspi QR payment for a university project. No real money is charged.
      </p>
    </main>
  );
}

function PayView({ token, bookingId, initial }: { token: string; bookingId: number | null; initial: Invoice }) {
  const [invoice, setInvoice] = useState(initial);
  const [busy, setBusy] = useState<"pay" | "decline" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const left = useCountdown(invoice.status === "pending" ? invoice.seconds_left : 0);

  async function send(decline: boolean) {
    setBusy(decline ? "decline" : "pay");
    setMessage(null);
    try {
      setInvoice(
        await api.POST("/api/fake-kaspi/{token}/pay", { params: { path: { token } }, body: { decline } }).then(must),
      );
    } catch (err) {
      // 402: declined on purpose, the customer may try again. 409: the hold ran out meanwhile.
      if (statusOf(err) === 409) setInvoice({ ...invoice, status: "expired", seconds_left: 0 });
      else setMessage(statusOf(err) === 402 ? "Payment declined (demo). You can try again." : messageOf(err));
    }
    setBusy(null);
  }

  if (invoice.status === "paid") {
    return (
      <FadeIn direction="up">
        <Card elevated className="fake-kaspi-card fake-kaspi-done">
          <span className="fake-kaspi-check" aria-hidden="true">
            ✓
          </span>
          <h1>Paid {price(invoice.amount)}</h1>
          <p className="muted">
            {invoice.merchant}
            {invoice.movie_title ? ` · ${invoice.movie_title}` : ""}
          </p>
          <p>Your tickets are ready. The cinema site on your computer updates by itself.</p>
          {bookingId && (
            <Button as={Link} to={`/bookings/${bookingId}`} variant="solid" size="lg" className="wide">
              Show my tickets
            </Button>
          )}
        </Card>
      </FadeIn>
    );
  }

  if (invoice.status !== "pending" || left === 0) {
    return (
      <EmptyState
        title={invoice.status === "cancelled" ? "This booking was cancelled" : "The 10 minutes ran out"}
        description="Nothing was charged. Pick your seats again on the cinema site."
        action={
          <Button as={Link} to="/" variant="solid">
            Back to the cinema
          </Button>
        }
      />
    );
  }

  return (
    <FadeIn direction="up">
      <Card elevated className="fake-kaspi-card">
        <div className="fake-kaspi-merchant">
          <BrandMark size="sm" />
          <span>{invoice.merchant}</span>
        </div>
        <p className="fake-kaspi-amount">{price(invoice.amount)}</p>

        <dl className="fake-kaspi-details">
          {invoice.movie_title && (
            <>
              <dt>Movie</dt>
              <dd>{invoice.movie_title}</dd>
            </>
          )}
          {invoice.start_time && (
            <>
              <dt>When</dt>
              <dd>{when(invoice.start_time)}</dd>
            </>
          )}
          {invoice.hall && (
            <>
              <dt>Hall</dt>
              <dd>{invoice.hall}</dd>
            </>
          )}
          <dt>Seats</dt>
          <dd className="fake-kaspi-seats">
            {invoice.seats.map((s) => (
              <Badge key={s} tone="neutral" variant="outline">
                {s}
              </Badge>
            ))}
          </dd>
        </dl>

        <p className={`fake-kaspi-timer${left <= 60 ? " urgent" : ""}`} role="timer" aria-live="off">
          Pay within <b>{clock(left)}</b>
        </p>

        <Button
          variant="solid"
          size="lg"
          className="wide fake-kaspi-pay"
          loading={busy === "pay"}
          disabled={busy !== null}
          onClick={() => void send(false)}
        >
          Pay {price(invoice.amount)}
        </Button>
        <Button
          variant="ghost"
          className="wide"
          loading={busy === "decline"}
          disabled={busy !== null}
          onClick={() => void send(true)}
        >
          Decline (demo)
        </Button>

        {message && (
          <p className="fake-kaspi-error" role="alert">
            {message}
          </p>
        )}
      </Card>
    </FadeIn>
  );
}
