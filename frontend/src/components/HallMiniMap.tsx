import { type Seat, price } from "../lib/format";
import { type TranslationKey, useI18n } from "../lib/i18n";
import { SEAT_COLORS } from "../three/hallScene";

const SEAT_TYPE_KEY: Record<string, TranslationKey> = {
  standard: "seat.standard",
  vip: "seat.vip",
  wheelchair: "seat.wheelchair",
};

function colorOf(seat: Seat, picked: boolean) {
  if (picked) return SEAT_COLORS.picked;
  if (seat.is_taken) return SEAT_COLORS.taken;
  return SEAT_COLORS[seat.seat_type as "standard" | "vip" | "wheelchair"] ?? SEAT_COLORS.standard;
}

/**
 * A small clickable plan of the hall inside the 3D view. Every seat button flies the 3D camera
 * straight to that seat; the seat you're looking from is ringed.
 */
export function HallMiniMap({
  seats,
  picked,
  current,
  onGo,
}: {
  seats: Seat[];
  picked: Set<number>;
  /** The seat the 3D view is looking from, if any. */
  current: number | null;
  onGo: (seat: Seat) => void;
}) {
  const { t } = useI18n();
  const cols = Math.max(...seats.map((s) => s.grid_col), 1);
  const rows = [...new Set(seats.map((s) => s.grid_row))].sort((a, b) => a - b);
  const line = (r: number) => rows.indexOf(r) + 1;
  const labelOf = new Map(seats.map((s) => [s.grid_row, s.row_label]));

  const rowFrom = Math.floor(rows.length * 0.45) + 1;
  const colFrom = Math.round(cols * 0.3);
  const best = {
    rowFrom,
    rowTo: Math.max(Math.round(rows.length * 0.75), rowFrom),
    colFrom,
    colTo: cols + 1 - colFrom,
  };

  const typeLabel = (seatType: string) => (SEAT_TYPE_KEY[seatType] ? t(SEAT_TYPE_KEY[seatType]) : seatType);

  return (
    <div className="minimap">
      <div className="minimap-screen" aria-hidden="true">
        <svg viewBox="0 0 320 14" preserveAspectRatio="none">
          <path d="M 6 12 Q 160 2 314 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span>{t("seat.screen")}</span>
      </div>
      <div className="minimap-seats" style={{ gridTemplateColumns: `1rem repeat(${cols}, minmax(0, 1fr)) 1rem` }}>
        {rows.length > 2 && (
          <span
            className="minimap-best"
            style={{ gridRow: `${best.rowFrom} / ${best.rowTo + 1}`, gridColumn: `${best.colFrom + 1} / ${best.colTo + 2}` }}
            aria-hidden="true"
          >
            <small>{t("seat.bestView")}</small>
          </span>
        )}
        {rows.map((r) => (
          <span key={`l${r}`} className="minimap-row" style={{ gridRow: line(r), gridColumn: 1 }} aria-hidden="true">
            {labelOf.get(r)}
          </span>
        ))}
        {seats.map((s) => {
          const on = picked.has(s.seat_id);
          const here = s.seat_id === current;
          const seatDesc = s.is_taken
            ? t("seat.ariaTaken", { row: s.row_label, seat: s.seat_number, type: typeLabel(s.seat_type) })
            : t("seat.ariaSeat", {
                row: s.row_label,
                seat: s.seat_number,
                type: typeLabel(s.seat_type),
                price: price(s.price),
              });
          return (
            <button
              key={s.seat_id}
              type="button"
              className={`minimap-seat${here ? " here" : ""}${s.is_taken && !on ? " taken" : ""}`}
              style={{ gridRow: line(s.grid_row), gridColumn: s.grid_col + 1, background: colorOf(s, on) }}
              aria-label={`${seatDesc}${on ? `, ${t("seat.picked")}` : ""}`}
              aria-current={here ? "true" : undefined}
              title={`${s.row_label}${s.seat_number} · ${s.is_taken ? t("seat.taken") : price(s.price)}`}
              onClick={() => onGo(s)}
            />
          );
        })}
        {rows.map((r) => (
          <span key={`r${r}`} className="minimap-row" style={{ gridRow: line(r), gridColumn: cols + 2 }} aria-hidden="true">
            {labelOf.get(r)}
          </span>
        ))}
      </div>
    </div>
  );
}
