import { type KeyboardEvent, type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import { type Seat, price } from "../lib/format";
import { HallScene, SEAT_COLORS } from "../three/hallScene";
import { Badge, Button, Card, Squircle } from "./ui";

const TYPE_LABEL: Record<string, string> = { standard: "Standard", vip: "VIP", wheelchair: "Wheelchair" };

const LEGEND: [string, string][] = [
  [SEAT_COLORS.standard, "Free"],
  [SEAT_COLORS.vip, "VIP"],
  [SEAT_COLORS.wheelchair, "Wheelchair"],
  [SEAT_COLORS.picked, "Your pick"],
  [SEAT_COLORS.taken, "Taken"],
];

/**
 * The hall in 3D (Three.js + GSAP), the main way to pick seats. It opens looking down on the whole
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
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HallScene | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
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
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [layout, hallType, failed]);

  // Taken seats and picks change often; they only recolour the existing model.
  useEffect(() => {
    sceneRef.current?.update(seats, picked);
  }, [seats, picked]);

  if (failed) return <>{fallback}</>;

  const focused = seats.find((s) => s.seat_id === focusedId) ?? null;
  const isPicked = focused ? picked.has(focused.seat_id) : false;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = 40;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (event.key === "Escape" && focusedId !== null) {
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
      radius={18}
      clipContent
      fill="#07080a"
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
            ? `View from row ${focused.row_label}, seat ${focused.seat_number}. Arrow keys look around, Escape goes back to the hall view.`
            : "3D view of the hall from above. Use the seat list after it to choose a seat."
        }
        onKeyDown={onKeyDown}
      />

      {/* Keyboard and screen-reader access to every seat; each one opens its view. */}
      <ul className="sr-only" aria-label="Seats">
        {seats.map((s) => (
          <li key={s.seat_id}>
            <button type="button" onClick={() => sceneRef.current?.flyToSeat(s.seat_id)}>
              Row {s.row_label}, seat {s.seat_number}, {TYPE_LABEL[s.seat_type] ?? s.seat_type},{" "}
              {s.is_taken ? "taken" : price(s.price)}
              {picked.has(s.seat_id) ? ", picked" : ""}
            </button>
          </li>
        ))}
      </ul>

      <p className="hall3d-hint" aria-hidden="true">
        {focused
          ? moving
            ? "Taking your seat…"
            : "Drag to look around · 180°"
          : "Tap a seat to see the screen from it"}
      </p>

      {focused && (
        <div className="hall3d-back">
          <Button size="sm" variant="solid" onClick={() => sceneRef.current?.backToOverview()} disabled={moving}>
            ← Back to hall view
          </Button>
        </div>
      )}

      {!focused && (
        <ul className="hall3d-legend" aria-label="Legend">
          {LEGEND.map(([color, label]) => (
            <li key={label}>
              <i style={{ background: color }} aria-hidden="true" /> {label}
            </li>
          ))}
        </ul>
      )}

      {hover && !focused && (
        <span className="hall3d-tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          {hover.seat.row_label}
          {hover.seat.seat_number} · {hover.seat.is_taken ? "taken" : price(hover.seat.price)}
        </span>
      )}

      {focused && (
        <div className="hall3d-panel">
          <Card elevated aria-live="polite">
            <div className="hall3d-seat">
              <b>
                Row {focused.row_label}, seat {focused.seat_number}
              </b>
              <span className="hall3d-badges">
                {focused.seat_type !== "standard" && (
                  <Badge tone="accent" variant="subtle">
                    {TYPE_LABEL[focused.seat_type] ?? focused.seat_type}
                  </Badge>
                )}
                <Badge tone={focused.is_taken ? "neutral" : "success"} variant="outline">
                  {focused.is_taken ? "Taken" : price(focused.price)}
                </Badge>
              </span>
            </div>
            {!focused.is_taken && (
              <Button
                size="sm"
                variant={isPicked ? "ghost" : "solid"}
                disabled={disabled || moving}
                onClick={() => onToggle(focused)}
              >
                {isPicked ? "Remove from my seats" : "Pick this seat"}
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
