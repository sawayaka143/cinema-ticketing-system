import { Link } from "react-router";
import { api } from "../api/client";
import { Badge, Button, Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { type MyBooking, price, when } from "../lib/format";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { must, useApi } from "../lib/useApi";

const STATUS_KEY: Record<MyBooking["status"], TranslationKey> = {
  pending: "bookings.status.pending",
  paid: "bookings.status.paid",
  cancelled: "bookings.status.cancelled",
  expired: "bookings.status.expired",
};

export function BookingsPage() {
  const { session, ready } = useAuth();
  const { locale, t } = useI18n();
  const list = useApi(() => api.GET("/api/me/bookings").then(must), session?.user.id ?? "anon");

  return (
    <FadeIn direction="up">
      <section className="panel">
        <h1>{t("bookings.title")}</h1>
        {!ready ? (
          <div className="my-bookings" aria-busy="true">
            <Skeleton width="100%" height="4rem" radius={12} />
            <Skeleton width="100%" height="4rem" radius={12} />
            <Skeleton width="100%" height="4rem" radius={12} />
          </div>
        ) : !session ? (
          <EmptyState
            title={t("bookings.loginTitle")}
            description={t("bookings.loginDesc")}
            action={
              <Button as={Link} to="/login" variant="solid">
                {t("nav.login")}
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
            title={t("bookings.loadErrorTitle")}
            message={t("bookings.loadErrorMsg")}
            details={list.message}
            onRetry={list.reload}
          />
        ) : list.data.length === 0 ? (
          <EmptyState
            title={t("bookings.emptyTitle")}
            description={t("bookings.emptyDesc")}
            action={
              <Button as={Link} to="/" variant="solid">
                {t("bookings.findMovie")}
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
                  <b>{b.movie_title ?? t("bookings.bookingNumber", { id: b.booking_id })}</b>
                  <span className="muted">
                    {b.start_time
                      ? when(b.start_time, locale)
                      : t("bookings.bookedAt", { when: when(b.booking_time, locale) })}
                    {b.hall && ` · ${b.hall}`}
                    {b.tickets.length > 0 &&
                      ` · ${t(b.tickets.length === 1 ? "bookings.seatOne" : "bookings.seatMany", { count: b.tickets.length })}`}
                  </span>
                </Link>
                <Badge tone={b.status === "paid" ? "accent" : "neutral"}>{t(STATUS_KEY[b.status])}</Badge>
                {b.tickets.length > 0 && <span className="num">{price(b.total_amount)}</span>}
              </Card>
            ))}
          </ul>
        )}
      </section>
    </FadeIn>
  );
}
