import { type FormEvent, lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api/client";
import { BundleHint } from "../components/BundleHint";
import { Status } from "../components/Layout";
import { SeatMap } from "../components/SeatMap";
import { ArrowLeftIcon } from "../components/TabIcons";
import { Button, Card, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { useAuth } from "../lib/auth-context";
import { bundleFor, bundleSaving } from "../lib/bundles";
import { fetchSeatMap, screeningKey } from "../lib/catalogCache";
import { price, span, type Seat } from "../lib/format";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { messageOf, must, statusOf, useApi } from "../lib/useApi";
import { PHONE_QUERY, useMediaQuery } from "../lib/useMediaQuery";

const MAX_SEATS = 10;

// Three.js is large, so the 3D hall is its own chunk, fetched after the page itself has shown.
const HallView3D = lazy(() => import("../components/HallView3D"));

const TICKET_TYPE_KEY: Record<string, TranslationKey> = {
  adult: "ticket.adult",
  student: "ticket.student",
  child: "ticket.child",
  staff: "ticket.staff",
};

const SEAT_TYPE_KEY: Record<string, TranslationKey> = {
  standard: "seat.standard",
  vip: "seat.vip",
  wheelchair: "seat.wheelchair",
};

function picksStorageKey(screeningId: number) {
  return `alatau:picks:${screeningId}`;
}

function loadSavedPicks(screeningId: number): Map<number, string> {
  try {
    const raw = sessionStorage.getItem(picksStorageKey(screeningId));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const entries: [number, string][] = [];
    for (const item of parsed) {
      if (Array.isArray(item) && typeof item[0] === "number" && typeof item[1] === "string") {
        entries.push([item[0], item[1]]);
      }
    }
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function savePicks(screeningId: number, picks: Map<number, string>) {
  try {
    if (picks.size === 0) sessionStorage.removeItem(picksStorageKey(screeningId));
    else sessionStorage.setItem(picksStorageKey(screeningId), JSON.stringify([...picks.entries()]));
  } catch {
    // storage blocked
  }
}

function defaultViewMode(isPhone: boolean): "2d" | "3d" {
  if (isPhone) return "2d";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "2d";
  }
  return "3d";
}

export function ScreeningPage() {
  const screeningId = Number(useParams().id);
  const navigate = useNavigate();
  const { session, ready } = useAuth();
  const { t } = useI18n();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [manualViewMode, setManualViewMode] = useState<"2d" | "3d" | null>(null);
  const viewMode = manualViewMode ?? defaultViewMode(isPhone);
  const setViewMode = (mode: "2d" | "3d") => setManualViewMode(mode);
  // Bumping `reload` refetches the seat map (after a 409, someone else took a seat).
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<Map<number, string>>(() => loadSavedPicks(screeningId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  // A login without a customer profile (e.g. made in the Supabase dashboard) can't book yet.
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    savePicks(screeningId, picked);
  }, [screeningId, picked]);

  const path = { params: { path: { screening_id: screeningId } } };
  // Film, hall and time rarely change, so they come from the cache first; seats never do.
  const detail = useApi(
    () => api.GET("/api/screenings/{screening_id}", path).then(must),
    screeningId,
    screeningKey(screeningId),
  );
  const seats = useApi(
    () => fetchSeatMap(screeningId, reload > 0),
    `${screeningId}:${reload}`,
  );

  // Ticket types allowed for this movie (age limit) and this user (staff); depends on login.
  const types = useApi(
    () =>
      api.GET("/api/ticket-types", { params: { query: { screening_id: screeningId } } }).then(must),
    `${screeningId}:${session?.user.id ?? "anon"}`,
  );

  if (detail.state === "error" || seats.state === "error") {
    const failed = detail.state === "error" ? detail : seats;
    return (
      <FadeIn direction="up">
        <ErrorState
          title={t("screening.loadErrorTitle")}
          message={t("screening.loadErrorMsg")}
          details={failed.state === "error" ? failed.message : undefined}
          onRetry={failed.reload}
        />
      </FadeIn>
    );
  }

  if (detail.state === "loading") {
    return (
      <section aria-busy="true">
        <Skeleton width="10rem" height="1rem" radius={6} />
        <Skeleton width="18rem" height="2.25rem" radius={8} style={{ marginTop: "0.5rem" }} />
        <Skeleton width="14rem" height="1.125rem" radius={6} style={{ marginTop: "0.5rem" }} />
        <div className="booking-layout">
          <Skeleton width="100%" height="18rem" radius={14} />
          <Card as="aside" elevated className="basket">
            <Skeleton width="8rem" height="1.5rem" radius={6} />
            <Skeleton width="100%" height="3rem" radius={8} style={{ marginTop: "0.75rem" }} />
            <Skeleton width="100%" height="2.75rem" radius={12} style={{ marginTop: "0.75rem" }} />
          </Card>
        </div>
      </section>
    );
  }

  const s = detail.data;
  const map = seats.state === "ready" ? seats.data : null;
  const seatById = new Map((map?.seats ?? []).map((seat) => [seat.seat_id, seat]));
  const chosen = [...picked.keys()].map((id) => seatById.get(id)).filter((x): x is Seat => !!x && !x.is_taken);
  const typeList = types.state === "ready" ? types.data : [];
  const typeNames = typeList.length > 0 ? typeList.map((tt) => tt.name) : ["adult"];
  const discountByType = new Map(typeList.map((tt) => [tt.name, Number(tt.discount_pct)]));
  const typeInfo = new Map(typeList.map((tt) => [tt.name, tt]));

  const ticketLabel = (name: string) =>
    TICKET_TYPE_KEY[name] ? t(TICKET_TYPE_KEY[name]) : name[0].toUpperCase() + name.slice(1);

  const seatTypeLabel = (seatType: string) =>
    SEAT_TYPE_KEY[seatType] ? t(SEAT_TYPE_KEY[seatType]) : seatType;

  const seatFinalPrice = (seat: Seat) => {
    const base = Number(seat.price);
    const chosenType = picked.get(seat.seat_id) ?? "adult";
    const pct = discountByType.get(chosenType) ?? 0;
    return Math.round(base * (1 - pct / 100));
  };

  const bundleItems = chosen.map((seat) => {
    const type = picked.get(seat.seat_id) ?? "adult";
    const info = typeInfo.get(type);
    return {
      seatPrice: Number(seat.price),
      type,
      discountPct: Number(info?.discount_pct ?? 0),
      staffOnly: info?.staff_only ?? false,
    };
  });
  const activeBundle = bundleFor(bundleItems.map((i) => i.type));
  const rawSubtotal = chosen.reduce((sum, seat) => sum + seatFinalPrice(seat), 0);
  const subtotal = Math.max(0, rawSubtotal - bundleSaving(bundleItems, activeBundle));
  const loginReturnUrl = `/login?next=${encodeURIComponent(`/screenings/${screeningId}`)}`;

  function toggle(seat: Seat) {
    setMessage(null);
    const next = new Map(picked);
    if (next.has(seat.seat_id)) next.delete(seat.seat_id);
    else if (next.size >= MAX_SEATS) {
      setMessage({ tone: "error", text: t("screening.maxSeats", { max: MAX_SEATS }) });
      return;
    } else next.set(seat.seat_id, "adult");
    setPicked(next);
  }

  function setType(seatId: number, type: string) {
    setPicked(new Map(picked).set(seatId, type));
  }

  async function hold() {
    setBusy(true);
    setMessage(null);
    try {
      const ids = chosen.map((seat) => seat.seat_id);
      const ticketTypes = Object.fromEntries(
        ids.map((id) => [String(id), picked.get(id) ?? "adult"]).filter(([, tt]) => tt !== "adult"),
      );
      const booking = await api
        .POST("/api/bookings", { body: { screening_id: screeningId, seat_ids: ids, ticket_types: ticketTypes } })
        .then(must);
      savePicks(screeningId, new Map());
      navigate(`/bookings/${booking.booking_id}`);
    } catch (err) {
      if (statusOf(err) === 409) {
        // Someone else was faster: drop the stale picks and show the fresh map.
        setPicked(new Map());
        setReload((n) => n + 1);
        setMessage({
          tone: "error",
          text: t("screening.mapUpdated", { error: messageOf(err) }),
        });
      } else if (statusOf(err) === 403 && messageOf(err).includes("customer profile")) {
        setNeedsProfile(true);
      } else {
        setMessage({ tone: "error", text: messageOf(err) });
      }
      setBusy(false);
    }
  }

  async function saveProfileAndHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = String(new FormData(event.currentTarget).get("full_name") ?? "").trim();
    setBusy(true);
    setMessage(null);
    try {
      await api.POST("/api/me/customer", { body: { full_name: fullName } }).then(must);
      setNeedsProfile(false);
      await hold();
    } catch (err) {
      setMessage({ tone: "error", text: messageOf(err) });
      setBusy(false);
    }
  }

  const holdCtaLabel = busy
    ? t("screening.holding")
    : chosen.length === 0
      ? t("screening.pickSeats")
      : chosen.length === 1
        ? t("screening.holdOne", { count: chosen.length })
        : t("screening.holdMany", { count: chosen.length });

  return (
    <>
      <FadeIn direction="up">
        <section className={chosen.length > 0 ? "screening-has-picks" : undefined}>
        <div className="screening-head">
          <div className="screening-title-group">
            <Link
              to={`/movies/${s.movie.movie_id}`}
              className="back-btn screening-back-btn"
              aria-label={s.movie.title}
            >
              <span className="back-btn-circle">
                <ArrowLeftIcon />
              </span>
              <span className="back-btn-label">{s.movie.title}</span>
            </Link>
            <div className="screening-heading-text">
              <h1>
                {s.hall.name} · {s.hall.hall_type}
              </h1>
              <p className="meta">
                {span(s)} · {t("screening.fromPrice", { price: price(s.base_price) })}
              </p>
            </div>
          </div>
          <div className="view-toggle" role="group" aria-label={t("screening.viewModeLabel")}>
            <button
              type="button"
              aria-pressed={viewMode === "2d"}
              className={`view-toggle-btn${viewMode === "2d" ? " view-toggle-active" : ""}`}
              onClick={() => setViewMode("2d")}
            >
              {t("screening.view2d")}
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "3d"}
              className={`view-toggle-btn${viewMode === "3d" ? " view-toggle-active" : ""}`}
              onClick={() => setViewMode("3d")}
            >
              {t("screening.view3d")}
            </button>
          </div>
        </div>

        <div className="booking-layout">
          <div className="hall-panel">
            {!map ? (
              <div className="hall-skeleton" aria-busy="true">
                <Skeleton width="72%" height="0.5rem" radius={999} />
                <div className="hall-skeleton-rows">
                  {Array.from({ length: 7 }, (_, i) => (
                    <Skeleton key={i} width={`${76 + (i % 3) * 6}%`} height="1.5rem" radius={6} />
                  ))}
                </div>
              </div>
            ) : viewMode === "2d" ? (
              <SeatMap seats={map.seats} picked={new Set(picked.keys())} onToggle={toggle} disabled={busy} />
            ) : (
              <Suspense fallback={<Skeleton width="100%" height="30rem" radius={18} aria-busy="true" />}>
                <HallView3D
                  seats={map.seats}
                  picked={new Set(picked.keys())}
                  onToggle={toggle}
                  disabled={busy}
                  hallType={s.hall.hall_type}
                  fallback={
                    <SeatMap seats={map.seats} picked={new Set(picked.keys())} onToggle={toggle} disabled={busy} />
                  }
                />
              </Suspense>
            )}
          </div>

          <Card as="aside" elevated className="basket" aria-label={t("screening.yourSeats")}>
            <h2>{t("screening.yourSeats")}</h2>
            {chosen.length === 0 ? (
              <p className="muted">
                {viewMode === "2d"
                  ? t("screening.emptyHint2d", { max: MAX_SEATS })
                  : t("screening.emptyHint3d", { max: MAX_SEATS })}
              </p>
            ) : (
              <>
                <ul className="picks">
                  {chosen.map((seat) => {
                    const activeType = picked.get(seat.seat_id) ?? "adult";
                    return (
                      <li key={seat.seat_id} className="pick-row">
                        <div className="pick-top">
                          <span className="pick-meta">
                            <span>
                              {t("screening.rowSeat", { row: seat.row_label, seat: seat.seat_number })}
                              {seat.seat_type !== "standard" && <small> · {seatTypeLabel(seat.seat_type)}</small>}
                            </span>
                          </span>
                          <span className="pick-price">{price(String(seatFinalPrice(seat)))}</span>
                        </div>
                        {typeNames.length > 1 && (
                          <div
                            className="ticket-pills"
                            role="radiogroup"
                            aria-label={t("screening.ticketTypeFor", { row: seat.row_label, seat: seat.seat_number })}
                          >
                            {typeNames.map((name) => {
                              const isSelected = activeType === name;
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  role="radio"
                                  aria-checked={isSelected}
                                  disabled={busy}
                                  className={`ticket-pill${isSelected ? " ticket-pill-active" : ""}`}
                                  onClick={() => setType(seat.seat_id, name)}
                                >
                                  {ticketLabel(name)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <BundleHint items={bundleItems} childAllowed={typeNames.includes("child")} />
                <div className="basket-total" aria-live="polite">
                  <span>{t("screening.estimatedTotal")}</span>
                  <b>{price(String(subtotal))}</b>
                </div>
              </>
            )}
            {typeList.some((tt) => Number(tt.discount_pct) > 0) && (
              <p className="muted small">
                {t("screening.discounts", {
                  list: typeList
                    .filter((tt) => Number(tt.discount_pct) > 0)
                    .map((tt) => `${ticketLabel(tt.name)} −${Number(tt.discount_pct)}%`)
                    .join(", "),
                })}
              </p>
            )}
            {needsProfile ? (
              <form className="form profile" onSubmit={saveProfileAndHold}>
                <p>{t("screening.profilePrompt")}</p>
                <label>
                  {t("auth.fullName")}
                  <input name="full_name" autoComplete="name" required maxLength={100} />
                </label>
                <Button type="submit" variant="solid" className="wide" loading={busy} disabled={busy}>
                  {busy ? t("screening.holding") : t("screening.saveAndHold")}
                </Button>
              </form>
            ) : !ready ? null : session ? (
              <Button
                type="button"
                variant="solid"
                className="wide"
                loading={busy}
                disabled={busy || chosen.length === 0}
                onClick={hold}
              >
                {holdCtaLabel}
              </Button>
            ) : (
              <Button as={Link} to={loginReturnUrl} variant="solid" className="wide">
                {t("screening.loginToBook")}
              </Button>
            )}
            {message && <Status tone={message.tone}>{message.text}</Status>}
          </Card>
        </div>
      </section>
    </FadeIn>

    {chosen.length > 0 && !needsProfile && ready && (
      <div className="mobile-basket-bar">
        <div className="mobile-basket-summary">
          <span className="mobile-basket-count">
            {chosen.length === 1
              ? t("bookings.seatOne", { count: chosen.length })
              : t("bookings.seatMany", { count: chosen.length })}
          </span>
          <b className="mobile-basket-price">{price(String(subtotal))}</b>
        </div>
        {session ? (
          <Button type="button" variant="solid" size="md" loading={busy} disabled={busy} onClick={hold}>
            {holdCtaLabel}
          </Button>
        ) : (
          <Button as={Link} to={loginReturnUrl} variant="solid" size="md">
            {t("screening.loginToBook")}
          </Button>
        )}
      </div>
    )}
    </>
  );
}
