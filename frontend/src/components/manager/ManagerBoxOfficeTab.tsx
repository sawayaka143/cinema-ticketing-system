import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { type CheckinOut, type RefundOut, type StaffBooking, price, when } from "../../lib/format";
import { messageOf, must } from "../../lib/useApi";
import { Status } from "../Layout";
import { Badge, Button } from "../ui";

/** Staff box-office desk: QR ticket check-in plus booking lookup and refund. */
export function ManagerBoxOfficeTab() {
  const [token, setToken] = useState("");
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkinResult, setCheckinResult] = useState<CheckinOut | null>(null);

  const [lookupId, setLookupId] = useState("");
  const [refundReason, setRefundReason] = useState("Customer request");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [booking, setBooking] = useState<StaffBooking | null>(null);
  const [refundResult, setRefundResult] = useState<RefundOut | null>(null);

  async function submitCheckin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) return;
    setCheckinBusy(true);
    setCheckinError(null);
    setCheckinResult(null);
    try {
      const res = await api.POST("/api/checkin", { body: { token: cleaned } }).then(must);
      setCheckinResult(res);
      setToken("");
    } catch (err) {
      setCheckinError(messageOf(err));
    }
    setCheckinBusy(false);
  }

  async function lookupBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = Number(lookupId);
    if (!Number.isInteger(id) || id <= 0) {
      setLookupError("Enter a valid numeric booking ID.");
      return;
    }
    setLookupBusy(true);
    setLookupError(null);
    setRefundResult(null);
    try {
      setBooking(
        await api
          .GET("/api/staff/bookings/{booking_id}", { params: { path: { booking_id: id } } })
          .then(must),
      );
    } catch (err) {
      setBooking(null);
      setLookupError(messageOf(err));
    }
    setLookupBusy(false);
  }

  async function issueRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!booking) return;
    const reason = refundReason.trim();
    if (!reason) {
      setLookupError("Enter a refund reason.");
      return;
    }
    setLookupBusy(true);
    setLookupError(null);
    try {
      const res = await api
        .POST("/api/staff/bookings/{booking_id}/refund", {
          params: { path: { booking_id: booking.booking_id } },
          body: { reason },
        })
        .then(must);
      setRefundResult(res);
      setBooking({ ...booking, status: res.status });
    } catch (err) {
      setLookupError(messageOf(err));
    }
    setLookupBusy(false);
  }

  return (
    <section className="mgr-box-grid" aria-label="Box office check-in and refunds">
      <div>
        <div className="mgr-toolbar">
          <h2>Ticket check-in</h2>
        </div>
        <form className="mgr-form" onSubmit={submitCheckin}>
          <label className="mgr-span-all">
            QR token
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste QR code payload"
              required
            />
          </label>
          <div className="mgr-form-actions">
            <Button type="submit" variant="solid" loading={checkinBusy} disabled={checkinBusy}>
              Check in
            </Button>
          </div>
        </form>
        {checkinError && <Status tone="error">{checkinError}</Status>}
        {checkinResult && (
          <div className="mgr-result" role="status">
            <p>
              <Badge tone="success" variant="subtle">
                Checked in
              </Badge>{" "}
              <b>Booking #{checkinResult.booking_id}</b> · {checkinResult.people} guest
              {checkinResult.people > 1 ? "s" : ""}
            </p>
            <p>
              {checkinResult.movie_title} · {checkinResult.hall} · {when(checkinResult.start_time)}
            </p>
            <p className="muted">Seats: {checkinResult.seats.join(", ")}</p>
          </div>
        )}
      </div>

      <div>
        <div className="mgr-toolbar">
          <h2>Booking lookup &amp; refund</h2>
        </div>
        <form className="mgr-form" onSubmit={lookupBooking}>
          <label className="mgr-span-all">
            Booking ID
            <input
              type="number"
              min={1}
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="e.g. 42"
              required
            />
          </label>
          <div className="mgr-form-actions">
            <Button type="submit" variant="solid" loading={lookupBusy} disabled={lookupBusy}>
              Find booking
            </Button>
          </div>
        </form>
        {lookupError && <Status tone="error">{lookupError}</Status>}
        {booking && (
          <div className="mgr-result">
            <p>
              <b>Booking #{booking.booking_id}</b>{" "}
              <Badge tone={booking.status === "paid" ? "accent" : "neutral"}>{booking.status}</Badge>
            </p>
            <p className="muted">
              {booking.customer_name ?? "Customer"}
              {booking.customer_email ? ` (${booking.customer_email})` : ""}
            </p>
            {booking.movie_title && (
              <p>
                {booking.movie_title}
                {booking.hall ? ` · ${booking.hall}` : ""}
                {booking.start_time ? ` · ${when(booking.start_time)}` : ""}
              </p>
            )}
            <p>
              Total: <b>{price(booking.total_amount)}</b>
              {booking.tickets.length > 0 &&
                ` · Seats: ${booking.tickets.map((t) => `${t.row_label}${t.seat_number}`).join(", ")}`}
            </p>
            {booking.status === "paid" && !booking.checked_in_at && (
              <form className="mgr-filters" onSubmit={issueRefund}>
                <input
                  aria-label="Refund reason"
                  className="mgr-inline-input"
                  style={{ width: "13rem", textAlign: "left" }}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Refund reason"
                  required
                />
                <Button type="submit" variant="ghost" disabled={lookupBusy}>
                  Refund booking
                </Button>
              </form>
            )}
            {refundResult && (
              <Status>
                Refunded {price(refundResult.refunded_amount)} at {when(refundResult.refunded_at)}.
              </Status>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
