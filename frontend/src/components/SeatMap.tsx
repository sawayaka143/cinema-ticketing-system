import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Seat } from "../lib/format";
import { price } from "../lib/format";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { PHONE_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { FitViewIcon, ZoomInIcon, ZoomOutIcon } from "./TabIcons";

const SEAT_TYPE_KEY: Record<string, TranslationKey> = {
  standard: "seat.standard",
  vip: "seat.vip",
  wheelchair: "seat.wheelchair",
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 2.75;
const ZOOM_STEP = 0.55;
const DRAG_THRESHOLD_PX = 6;
const VIEWPORT_PAD_X = 24;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** The hall as a zoomable, centered 2D grid: screen + seats share one transformable stage. */
export function SeatMap({
  seats,
  picked,
  onToggle,
  disabled,
}: {
  seats: Seat[];
  picked: Set<number>;
  onToggle: (seat: Seat) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const cols = Math.max(...seats.map((s) => s.grid_col), 1);
  const rows = [...new Set(seats.map((s) => s.grid_row))].sort((a, b) => a - b);
  const labelOf = new Map(seats.map((s) => [s.grid_row, s.row_label]));
  const rowIndex = (r: number) => rows.indexOf(r) + 1;

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [metrics, setMetrics] = useState({
    viewportW: 0,
    naturalW: 0,
    naturalH: 0,
  });
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });

  const viewRef = useRef(view);
  const metricsRef = useRef(metrics);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
    moved: false,
  });
  const pinchRef = useRef({
    startDist: 0,
    startZoom: 1,
    startPanX: 0,
    startPanY: 0,
    midX: 0,
    midY: 0,
  });
  const suppressClickRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    const vp = viewportRef.current;
    const st = stageRef.current;
    if (!vp || !st) return;

    const measure = () => {
      const viewportW = Math.max(0, vp.clientWidth - VIEWPORT_PAD_X);
      const naturalW = st.offsetWidth;
      const naturalH = st.offsetHeight;
      setMetrics((prev) =>
        prev.viewportW === viewportW && prev.naturalW === naturalW && prev.naturalH === naturalH
          ? prev
          : { viewportW, naturalW, naturalH },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    ro.observe(st);
    return () => ro.disconnect();
  }, [cols, rows.length]);

  // Prevent browser page-zoom when pinching with 2 fingers inside the hall viewport.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    vp.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => vp.removeEventListener("touchmove", onTouchMove);
  }, []);

  const fitScale =
    metrics.viewportW > 0 && metrics.naturalW > 0
      ? Math.min(1, metrics.viewportW / metrics.naturalW)
      : 1;
  const stageWrapH = metrics.naturalH > 0 ? Math.ceil(metrics.naturalH * fitScale) : undefined;
  const showControls = isPhone || fitScale < 0.99;

  const clampPan = useCallback((zoom: number, panX: number, panY: number) => {
    const m = metricsRef.current;
    if (zoom <= 1 || m.viewportW === 0 || m.naturalW === 0 || m.naturalH === 0) {
      return { zoom: 1, panX: 0, panY: 0 };
    }
    const baseScale = Math.min(1, m.viewportW / m.naturalW);
    const totalScale = baseScale * zoom;
    const scaledW = m.naturalW * totalScale;
    const scaledH = m.naturalH * totalScale;
    const wrapH = m.naturalH * baseScale;
    const maxX = Math.max(0, (scaledW - m.viewportW) / 2);
    const maxY = Math.max(0, (scaledH - wrapH) / 2);
    return {
      zoom,
      panX: clamp(panX, -maxX, maxX),
      panY: clamp(panY, -maxY, maxY),
    };
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      setView((prev) => {
        const nextZoom = clamp(Number((prev.zoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM);
        if (nextZoom <= MIN_ZOOM) return { zoom: 1, panX: 0, panY: 0 };
        const factor = nextZoom / prev.zoom;
        return clampPan(nextZoom, prev.panX * factor, prev.panY * factor);
      });
    },
    [clampPan],
  );

  const resetZoom = useCallback(() => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".hall-zoom-controls")) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPanX: viewRef.current.panX,
        origPanY: viewRef.current.panY,
        moved: false,
      };
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      const rect = viewportRef.current?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : 0;
      const cy = rect ? rect.top + rect.height / 2 : 0;
      pinchRef.current = {
        startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
        startZoom: viewRef.current.zoom,
        startPanX: viewRef.current.panX,
        startPanY: viewRef.current.panY,
        midX: (p1.x + p2.x) / 2 - cx,
        midY: (p1.y + p2.y) / 2 - cy,
      };
      suppressClickRef.current = true;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const pinch = pinchRef.current;
      const nextZoom = clamp(pinch.startZoom * (dist / pinch.startDist), MIN_ZOOM, MAX_ZOOM);
      const ratio = nextZoom / pinch.startZoom;
      const nextPanX = pinch.midX - (pinch.midX - pinch.startPanX) * ratio;
      const nextPanY = pinch.midY - (pinch.midY - pinch.startPanY) * ratio;
      suppressClickRef.current = true;
      setView(clampPan(nextZoom, nextPanX, nextPanY));
      return;
    }

    if (pointersRef.current.size === 1 && viewRef.current.zoom > 1) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (!dragRef.current.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragRef.current.moved = true;
        suppressClickRef.current = true;
      }
      if (dragRef.current.moved) {
        setView(
          clampPan(
            viewRef.current.zoom,
            dragRef.current.origPanX + dx,
            dragRef.current.origPanY + dy,
          ),
        );
      }
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const wasSingle = pointersRef.current.size === 1;
    pointersRef.current.delete(e.pointerId);

    // Double-tap on non-seat canvas toggles 1x <-> 2x zoom around the tapped point.
    if (
      wasSingle &&
      !dragRef.current.moved &&
      !suppressClickRef.current &&
      !(e.target as HTMLElement).closest("button")
    ) {
      const now = Date.now();
      const prev = lastTapRef.current;
      if (prev && now - prev.time < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 32) {
        lastTapRef.current = null;
        if (viewRef.current.zoom > 1.1) {
          resetZoom();
        } else {
          const rect = viewportRef.current?.getBoundingClientRect();
          const cx = rect ? rect.left + rect.width / 2 : 0;
          const cy = rect ? rect.top + rect.height / 2 : 0;
          const targetZoom = 2;
          const tapX = e.clientX - cx;
          const tapY = e.clientY - cy;
          setView(clampPan(targetZoom, -tapX * (targetZoom - 1), -tapY * (targetZoom - 1)));
        }
      } else {
        lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
      }
    }

    if (pointersRef.current.size === 0 && suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  const totalScale = fitScale * view.zoom;

  return (
    <div className="hall">
      <div className="hall-frame">
        <div
          ref={viewportRef}
          className={`hall-viewport${view.zoom > 1 ? " hall-viewport-zoomed" : ""}`}
          style={{ touchAction: view.zoom > 1 ? "none" : "pan-y" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={onClickCapture}
        >
          <div
            className="hall-stage-wrap"
            style={stageWrapH ? { height: `${stageWrapH}px` } : undefined}
          >
            <div
              ref={stageRef}
              className="hall-stage"
              style={{
                transform: `translate(${view.panX}px, ${view.panY}px) scale(${totalScale})`,
              }}
            >
              <div className="screen" aria-hidden="true">
                <svg className="screen-arc" viewBox="0 0 320 14" preserveAspectRatio="none">
                  <path
                    d="M 6 12 Q 160 2 314 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{t("seat.screen")}</span>
              </div>

              <div
                className="seats"
                style={{ gridTemplateColumns: `1.5rem repeat(${cols}, 2.25rem) 1.5rem` }}
              >
                {rows.map((r) => (
                  <RowLabel key={`l${r}`} row={rowIndex(r)} label={labelOf.get(r) ?? ""} col={1} />
                ))}
                {seats.map((s) => {
                  const on = picked.has(s.seat_id);
                  const typeLabel = SEAT_TYPE_KEY[s.seat_type]
                    ? t(SEAT_TYPE_KEY[s.seat_type])
                    : s.seat_type;
                  const ariaLabel = s.is_taken
                    ? t("seat.ariaTaken", {
                        row: s.row_label,
                        seat: s.seat_number,
                        type: typeLabel,
                      })
                    : t("seat.ariaSeat", {
                        row: s.row_label,
                        seat: s.seat_number,
                        type: typeLabel,
                        price: price(s.price),
                      });
                  return (
                    <button
                      key={s.seat_id}
                      type="button"
                      className={`seat seat-${s.seat_type}`}
                      style={{ gridRow: rowIndex(s.grid_row), gridColumn: s.grid_col + 1 }}
                      disabled={s.is_taken || disabled}
                      aria-pressed={on}
                      aria-label={ariaLabel}
                      title={
                        s.is_taken
                          ? `${s.row_label}${s.seat_number} · ${t("seat.taken")}`
                          : `${s.row_label}${s.seat_number} · ${price(s.price)}`
                      }
                      onClick={() => onToggle(s)}
                    >
                      {s.seat_number}
                    </button>
                  );
                })}
                {rows.map((r) => (
                  <RowLabel
                    key={`r${r}`}
                    row={rowIndex(r)}
                    label={labelOf.get(r) ?? ""}
                    col={cols + 2}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {showControls && (
          <div className="hall-toolbar" role="group" aria-label={t("screening.view2d")}>
            <span className="hall-zoom-readout" aria-live="polite">
              {Math.round(view.zoom * 100)}%
            </span>
            <div className="hall-zoom-controls">
              <button
                type="button"
                className="hall-zoom-btn"
                onClick={() => zoomBy(-ZOOM_STEP)}
                disabled={view.zoom <= MIN_ZOOM}
                aria-label={t("seat.zoomOut")}
                title={t("seat.zoomOut")}
              >
                <ZoomOutIcon />
              </button>
              <button
                type="button"
                className="hall-zoom-btn"
                onClick={() => zoomBy(ZOOM_STEP)}
                disabled={view.zoom >= MAX_ZOOM}
                aria-label={t("seat.zoomIn")}
                title={t("seat.zoomIn")}
              >
                <ZoomInIcon />
              </button>
              <button
                type="button"
                className="hall-zoom-btn"
                onClick={resetZoom}
                disabled={view.zoom <= 1.01}
                aria-label={t("seat.resetZoom")}
                title={t("seat.resetZoom")}
              >
                <FitViewIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      <ul className="legend" aria-label={t("seat.legend")}>
        <li>
          <i className="seat" /> {t("seat.free")}
        </li>
        <li>
          <i className="seat seat-vip" /> {t("seat.vip")}
        </li>
        <li>
          <i className="seat seat-wheelchair" /> {t("seat.wheelchair")}
        </li>
        <li>
          <i className="seat on" /> {t("seat.yourPick")}
        </li>
        <li>
          <i className="seat taken" /> {t("seat.taken")}
        </li>
      </ul>
    </div>
  );
}

function RowLabel({ row, label, col }: { row: number; label: string; col: number }) {
  return (
    <span className="row-label" style={{ gridRow: row, gridColumn: col }} aria-hidden="true">
      {label}
    </span>
  );
}
