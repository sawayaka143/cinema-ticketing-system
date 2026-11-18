import { useEffect, useEffectEvent } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import type { Booking } from "../lib/format";
import { must, useApi } from "../lib/useApi";
import { Button, ErrorState, Skeleton, Squircle } from "./ui";

const POLL_MS = 2000;

/**
 * Demo Kaspi QR payment (#99): the QR opens /fake-kaspi/<token> on a phone, where the customer
 * taps "Pay". Meanwhile this page polls the booking and hands it back once it is paid.
 * The QR is also a link, so someone already on a phone can just tap it.
 */
export function KaspiQr({
  booking,
  onPaid,
  onBack,
}: {
  booking: Booking;
  onPaid: (booking: Booking) => void;
  onBack: () => void;
}) {
  const path = { params: { path: { booking_id: booking.booking_id } } };
  const invoice = useApi(async () => {
    const inv = await api.POST("/api/bookings/{booking_id}/kaspi-invoice", path).then(must);
    // Only the frontend knows its own address, so the full link and the QR image are made here.
    const link = `${inv.pay_path}?b=${booking.booking_id}`;
    const url = `${window.location.origin}${link}`;
    // Loaded on demand: only people paying with Kaspi need the QR library.
    const { default: QRCode } = await import("qrcode");
    const image = await QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: "M" });
    return { link, image };
  }, booking.booking_id);

  // Poll the booking; the phone pays on its own, this page only has to notice.
  const check = useEffectEvent(async () => {
    const latest = await api.GET("/api/bookings/{booking_id}", path).then(must);
    if (latest.status !== "pending") onPaid(latest);
  });
  useEffect(() => {
    const id = setInterval(() => void check().catch(() => undefined), POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (invoice.state === "loading") {
    return (
      <div className="kaspi-qr" aria-busy="true">
        <Skeleton width={240} height={240} radius={16} />
        <Skeleton width="14rem" height="1rem" radius={6} />
      </div>
    );
  }

  if (invoice.state === "error") {
    return (
      <ErrorState
        title="Couldn't start the Kaspi payment"
        message="We couldn't create a payment link for this booking. Please try again."
        details={invoice.message}
        onRetry={invoice.reload}
      />
    );
  }

  const { link, image } = invoice.data;
  return (
    <div className="kaspi-qr">
      <Squircle
        as={Link}
        to={link}
        radius={18}
        fill="#fff"
        shadow="elevated"
        className="kaspi-qr-code"
        aria-label="Open the Kaspi payment page (demo)"
        title="Tap to open the payment page"
      >
        <img src={image} alt="" width={240} height={240} />
        <span className="kaspi-qr-tap" aria-hidden="true">
          <TapIcon /> Tap
        </span>
      </Squircle>
      <div className="kaspi-qr-text">
        <p>
          <b>Scan with your phone camera</b> to pay in the demo Kaspi app.
        </p>
        <p className="kaspi-qr-hint">
          <TapIcon />
          <span>
            On your phone? <b>Tap the code</b> to open the payment page.
          </span>
        </p>
        <p className="muted small" role="status" aria-live="polite">
          <span className="kaspi-qr-pulse" aria-hidden="true" /> Waiting for the payment… this page
          updates by itself.
        </p>
        <div className="actions">
          <Button as={Link} to={link} variant="solid" className="kaspi-open">
            Open Kaspi
          </Button>
          <Button type="button" variant="ghost" onClick={onBack}>
            Pay by card instead
          </Button>
        </div>
      </div>
    </div>
  );
}

function TapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0 0V8.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.8-2.4L4.4 15a1.5 1.5 0 0 1 2.3-1.9L9 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
