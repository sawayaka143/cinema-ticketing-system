import { type KeyboardEvent, type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { type Seat, price } from "../lib/format";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { startSeat } from "../lib/startSeat";
import { HallScene, SEAT_COLORS } from "../three/hallScene";
import { HallMiniMap } from "./HallMiniMap";
import { Badge, Button, Card, Squircle } from "./ui";

const SEAT_TYPE_KEY: Record<string, TranslationKey> = {
  standard: "seat.standard",
  vip: "seat.vip",
  wheelchair: "seat.wheelchair",
};

type LegendKind = "free" | "vip" | "wheelchair" | "picked" | "taken";

const LEGEND_ITEMS: { color: string; labelKey: TranslationKey; kind: LegendKind }[] = [
  { color: SEAT_COLORS.standard, labelKey: "seat.free", kind: "free" },
  { color: SEAT_COLORS.vip, labelKey: "seat.vip", kind: "vip" },
  { color: SEAT_COLORS.wheelchair, labelKey: "seat.wheelchair", kind: "wheelchair" },
  { color: SEAT_COLORS.picked, labelKey: "seat.yourPick", kind: "picked" },
  { color: SEAT_COLORS.taken, labelKey: "seat.taken", kind: "taken" },
];

function LegendMark({ kind }: { kind: LegendKind }) {
  if (kind === "vip") {
    return (
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M6 1.5l1.3 2.7 3 .4-2.2 2.1.5 3L6 8.3 3.4 9.7l.5-3L1.7 4.6l3-.4z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "wheelchair") {
    return (
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
        <circle cx="5.5" cy="2.5" r="1" fill="currentColor" stroke="none" />
        <path d="M5 4.5v3h3.2l1.1 2.3" />
        <path d="M7.2 9A2.6 2.6 0 1 1 3.6 6.2" />
      </svg>
    );
  }
  if (kind === "picked") {
    return (
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 6.2L5 8.7 9.5 3.5" />
      </svg>
    );
  }
  if (kind === "taken") {
    return (
      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
    );
  }
  return null;
}

/**
 * The hall in 3D (Three.js + GSAP), paired with the 2D toggle. It opens looking down on the whole
 * hall; click a seat and the camera comes down to a seated person's eyes, facing the screen.
 * Drag to look around 180°; "Back to hall view" goes up again. Without WebGL it shows `fallback`.
 */
export default function HallView3D({
  seats,
  picked,
  onToggle,
  disabled,
  hallType,
  fallback,
}: {
  seats: Seat[];
  /** "IMAX" halls get the wall-to-wall screen and steeper rows. */
  hallType: string;
  picked: Set<number>;
  onToggle: (seat: Seat) => void;
  disabled?: boolean;
  /** Shown instead when the device can't do 3D (WebGL): the 2D seat map. */
  fallback: ReactNode;
}) {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HallScene | null>(null);
  const panelBtnRef = useRef<HTMLElement | null>(null);
  const skipNextFocusRef = useRef(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [hover, setHover] = useState<{ seat: Seat; x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(() => !hasWebGL());

  // Latest props for the scene's first paint, without rebuilding it on every pick.
  const current = useEffectEvent(() => ({ seats, picked }));
  // The 3D model only depends on the seat layout.
  const layout = seats.map((s) => `${s.seat_id}:${s.grid_row}:${s.grid_col}`).join(",");

  useEffect(() => {
    const el = mountRef.current;
    if (!el || failed) return;
    const initial = current();
    let scene: HallScene;
    try {
      scene = new HallScene(el, initial.seats, {
        hallType,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onHover: (seat, x, y) => {
          const box = el.getBoundingClientRect();
          setHover(seat ? { seat, x: x - box.left, y: y - box.top } : null);
        },
        onFocus: (seat) => setFocusedId(seat?.seat_id ?? null),
        onMoving: setMoving,
      });
    } catch {
      // WebGL was there but the scene couldn't start (e.g. the GPU context was refused).
      void Promise.resolve().then(() => setFailed(true));
      return;
    }
    scene.update(initial.seats, initial.picked);
    sceneRef.current = scene;
    const initialSeat = startSeat(initial.seats);
    if (initialSeat) {
      skipNextFocusRef.current = true;
      scene.flyToSeat(initialSeat.seat_id, { immediate: true });
    }
    void Promise.resolve().then(() => setSceneReady(true));
    return () => {
      scene.dispose();
      sceneRef.current = null;
      setSceneReady(false);
    };
  }, [layout, hallType, failed]);

  // Taken seats and picks change often; they only recolour the existing model.
  useEffect(() => {
    sceneRef.current?.update(seats, picked);
  }, [seats, picked]);

  // Move keyboard focus to the pick button when a seat is focused so keyboard users aren't trapped.
  useEffect(() => {
    if (focusedId !== null) {
      if (skipNextFocusRef.current) {
        skipNextFocusRef.current = false;
        return;
      }
      panelBtnRef.current?.focus({ preventScroll: true });
    }
  }, [focusedId]);

  if (failed) return <>{fallback}</>;

  const focused = seats.find((s) => s.seat_id === focusedId) ?? null;
  const isPicked = focused ? picked.has(focused.seat_id) : false;

  const typeLabel = (seatType: string) =>
    SEAT_TYPE_KEY[seatType] ? t(SEAT_TYPE_KEY[seatType]) : seatType;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = 40;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (event.key === "Escape" && showPlan) {
      event.preventDefault();
      setShowPlan(false);
    } else if (event.key === "Escape" && focusedId !== null) {
      event.preventDefault();
      sceneRef.current?.backToOverview();
    } else if (keys[event.key] && focusedId !== null) {
      event.preventDefault();
      sceneRef.current?.nudge(...keys[event.key]);
    }
  }

  return (
    <Squircle
      as="div"
      radius={6}
      smoothing={0.5}
      clipContent
      fill="#12100e"
      stroke="var(--border)"
      className="hall3d"
      innerClassName="hall3d-inner"
    >
      <div
        ref={mountRef}
        className="hall3d-stage"
        tabIndex={0}
        role="application"
        aria-roledescription="3D hall"
        aria-label={
          focused
            ? t("seat.ariaViewFrom", { row: focused.row_label, seat: focused.seat_number })
            : t("seat.ariaOverview")
        }
        onKeyDown={onKeyDown}
      />

      {!sceneReady && (
        <div className="hall3d-loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{t("seat.loading3d")}</span>
        </div>
      )}

      {/* Keyboard and screen-reader access to every seat; each one opens its view and moves focus to the action panel. */}
      <ul className="sr-only" aria-label={t("screening.yourSeats")}>
        {seats.map((s) => (
          <li key={s.seat_id}>
            <button type="button" onClick={() => sceneRef.current?.flyToSeat(s.seat_id)}>
              {s.is_taken
                ? t("seat.ariaTaken", { row: s.row_label, seat: s.seat_number, type: typeLabel(s.seat_type) })
                : t("seat.ariaSeat", {
                    row: s.row_label,
                    seat: s.seat_number,
                    type: typeLabel(s.seat_type),
                    price: price(s.price),
                  })}
              {picked.has(s.seat_id) ? `, ${t("seat.picked")}` : ""}
            </button>
          </li>
        ))}
      </ul>

      <p className="hall3d-hint" aria-hidden="true">
        {focused
          ? moving
            ? t("seat.hintMoving")
            : t("seat.hintLook")
          : t("seat.hintOverview")}
      </p>

      <div className="hall3d-back">
        <Button
          size="sm"
          variant={showPlan ? "solid" : "outline"}
          aria-expanded={showPlan}
          onClick={() => setShowPlan((open) => !open)}
        >
          {t("seat.hallPlan")}
        </Button>
        {focused && (
          <Button size="sm" variant="solid" onClick={() => sceneRef.current?.backToOverview()} disabled={moving}>
            {t("seat.backToHall")}
          </Button>
        )}
      </div>

      {showPlan && (
        <div className="hall3d-plan-pop">
          <Card as="section" elevated className="minimap-card glass" aria-label={t("seat.hallPlan")}>
            <HallMiniMap
              seats={seats}
              picked={picked}
              current={focusedId}
              onGo={(seat) => {
                sceneRef.current?.flyToSeat(seat.seat_id);
              }}
            />
          </Card>
        </div>
      )}

      {!focused && (
        <ul className="hall3d-legend" aria-label={t("seat.legend")}>
          {LEGEND_ITEMS.map((item) => (
            <li key={item.kind}>
              <i
                className={`legend-swatch legend-swatch-${item.kind}`}
                style={{ background: item.color }}
                aria-hidden="true"
              >
                <LegendMark kind={item.kind} />
              </i>
              {t(item.labelKey)}
            </li>
          ))}
        </ul>
      )}

      {hover && !focused && (
        <span className="hall3d-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          {hover.seat.row_label}
          {hover.seat.seat_number} · {hover.seat.is_taken ? t("seat.taken") : price(hover.seat.price)}
        </span>
      )}

      {focused && (
        <div className="hall3d-panel">
          <Card elevated aria-live="polite">
            <div className="hall3d-seat">
              <b>{t("screening.rowSeat", { row: focused.row_label, seat: focused.seat_number })}</b>
              <span className="hall3d-badges">
                {focused.seat_type !== "standard" && (
                  <Badge tone="accent" variant="subtle">
                    {typeLabel(focused.seat_type)}
                  </Badge>
                )}
                <Badge tone={focused.is_taken ? "neutral" : "success"} variant="outline">
                  {focused.is_taken ? t("seat.taken") : price(focused.price)}
                </Badge>
              </span>
            </div>
            {!focused.is_taken && (
              <Button
                ref={panelBtnRef}
                size="sm"
                variant={isPicked ? "ghost" : "solid"}
                disabled={disabled || moving}
                onClick={() => onToggle(focused)}
              >
                {isPicked ? t("seat.removeThis") : t("seat.pickThis")}
              </Button>
            )}
          </Card>
        </div>
      )}
    </Squircle>
  );
}

/** True when the browser can create a WebGL context (needed for the 3D hall). */
function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
