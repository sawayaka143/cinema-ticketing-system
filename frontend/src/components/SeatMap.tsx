import type { Seat } from "../lib/format";
import { price } from "../lib/format";

const TYPE_LABEL: Record<string, string> = { standard: "Standard", vip: "VIP", wheelchair: "Wheelchair" };

/** The hall as a grid: one button per seat, placed by grid_row / grid_col, screen at the top. */
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
  const cols = Math.max(...seats.map((s) => s.grid_col), 1);
  const rows = [...new Set(seats.map((s) => s.grid_row))].sort((a, b) => a - b);
  const labelOf = new Map(seats.map((s) => [s.grid_row, s.row_label]));
  const rowIndex = (r: number) => rows.indexOf(r) + 1;

  return (
    <div className="hall">
      <div className="screen" aria-hidden="true">
        Screen
      </div>
      <div className="seats" style={{ gridTemplateColumns: `2rem repeat(${cols}, minmax(0, 2.25rem)) 2rem` }}>
        {rows.map((r) => (
          <RowLabel key={`l${r}`} row={rowIndex(r)} label={labelOf.get(r) ?? ""} col={1} />
        ))}
        {seats.map((s) => {
          const on = picked.has(s.seat_id);
          const name = `Row ${s.row_label}, seat ${s.seat_number}, ${TYPE_LABEL[s.seat_type] ?? s.seat_type}, ${price(s.price)}`;
          return (
            <button
              key={s.seat_id}
              type="button"
              className={`seat seat-${s.seat_type}`}
              style={{ gridRow: rowIndex(s.grid_row), gridColumn: s.grid_col + 1 }}
              disabled={s.is_taken || disabled}
              aria-pressed={on}
              aria-label={s.is_taken ? `${name}, taken` : name}
              title={s.is_taken ? `${s.row_label}${s.seat_number} · taken` : `${s.row_label}${s.seat_number} · ${price(s.price)}`}
              onClick={() => onToggle(s)}
            >
              {s.seat_number}
            </button>
          );
        })}
        {rows.map((r) => (
          <RowLabel key={`r${r}`} row={rowIndex(r)} label={labelOf.get(r) ?? ""} col={cols + 2} />
        ))}
      </div>
      <ul className="legend" aria-label="Legend">
        <li>
          <i className="seat" /> Free
        </li>
        <li>
          <i className="seat seat-vip" /> VIP
        </li>
        <li>
          <i className="seat seat-wheelchair" /> Wheelchair
        </li>
        <li>
          <i className="seat on" /> Your pick
        </li>
        <li>
          <i className="seat taken" /> Taken
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
