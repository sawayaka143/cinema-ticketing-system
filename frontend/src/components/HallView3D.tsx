import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type Seat, price } from "../lib/format";
import { HallScene } from "../three/hallScene";
import { Badge, Button, Card, EmptyState, Squircle } from "./ui";

const TYPE_LABEL: Record<string, string> = { standard: "Standard", vip: "VIP", wheelchair: "Wheelchair" };

/**
 * The hall in 3D (Three.js + GSAP): click a seat and the camera flies to it, at the height of a
 * seated person's eyes, facing the screen. Drag to look around 180°; "Back to hall view" returns.
 * Loaded lazily, so Three.js only downloads for people who open this view.
 */
export default function HallView3D({
  seats,
  picked,
  onToggle,
  disabled,
  title,
  subtitle,
  onClose,
}: {
  seats: Seat[];
  picked: Set<number>;
  onToggle: (seat: Seat) => void;
  disabled?: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HallScene | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [hover, setHover] = useState<{ seat: Seat; x: number; y: number } | null>(null);
  const [failed, setFailed] = useState(false);

  // Latest props for the scene's first paint, without rebuilding it on every pick.
  const latest = useRef({ seats, picked });
  latest.current = { seats, picked };
  // The 3D model only depends on the seat layout and the screen text.
  const layout = seats.map((s) => `${s.seat_id}:${s.grid_row}:${s.grid_col}`).join(",");

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let scene: HallScene;
    try {
      scene = new HallScene(el, latest.current.seats, {
        title,
        subtitle,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onHover: (seat, x, y) => {
          const box = el.getBoundingClientRect();
          setHover(seat ? { seat, x: x - box.left, y: y - box.top } : null);
        },
        onFocus: (seat) => setFocusedId(seat?.seat_id ?? null),
        onMoving: setMoving,
      });
    } catch {
      setFailed(true);
      return;
    }
    scene.update(latest.current.seats, latest.current.picked);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when the layout changes
  }, [layout, title, subtitle]);

  // Taken seats and picks change often; they only recolour the existing model.
  useEffect(() => {
    sceneRef.current?.update(seats, picked);
  }, [seats, picked]);

  if (failed) {
    return (
      <EmptyState
        title="3D view isn't available here"
        description="This browser or device can't show 3D graphics (WebGL). The seat map works everywhere."
        action={
          <Button variant="solid" onClick={onClose}>
            Back to the seat map
          </Button>
        }
      />
    );
  }

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
            ? `View from row ${focused.row_label}, seat ${focused.seat_number}. Arrow keys look around, Escape returns to the hall view.`
            : "3D view of the hall. Click a seat to see the screen from it."
        }
        onKeyDown={onKeyDown}
      />

      <p className="hall3d-hint" aria-hidden="true">
        {focused
          ? moving
            ? "Taking your seat…"
            : "Drag to look around · 180°"
          : "Click any seat to see the screen from it · drag to turn the hall"}
      </p>

      {focused && (
        <div className="hall3d-back">
          <Button size="sm" variant="solid" onClick={() => sceneRef.current?.backToOverview()} disabled={moving}>
            ← Back to hall view
          </Button>
        </div>
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
