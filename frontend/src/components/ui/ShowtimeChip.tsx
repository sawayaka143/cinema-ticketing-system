import { Link } from "react-router";
import { prefetchSeatMap } from "../../lib/catalogCache";
import { type Screening, price, timeOf } from "../../lib/format";
import { Squircle } from "./Squircle";

export interface ShowtimeChipProps {
  screening: Screening;
  className?: string;
}

export function ShowtimeChip({ screening, className = "" }: ShowtimeChipProps) {
  const formatTone =
    screening.hall.hall_type === "IMAX"
      ? "chip-type-imax"
      : screening.hall.hall_type === "3D"
        ? "chip-type-3d"
        : "chip-type-2d";

  const warm = () => prefetchSeatMap(screening.screening_id);

  return (
    <Squircle
      as={Link}
      to={`/screenings/${screening.screening_id}`}
      onPointerEnter={warm}
      onFocus={warm}
      onTouchStart={warm}
      radius={6}
      smoothing={0.5}
      fill="var(--surface-2)"
      stroke="var(--border)"
      strokeWidth={1}
      shadow="none"
      className={`showtime-chip ${className}`.trim()}
    >
      <span className="chip-content">
        <span className="chip-top">
          <span className="chip-times">
            <b className="chip-time">{timeOf(screening.start_time)}</b>
            <span className="chip-end">–{timeOf(screening.end_time)}</span>
          </span>
          <span className="chip-price">{price(screening.base_price)}</span>
        </span>
        <span className="chip-hall">
          <strong className={`chip-type ${formatTone}`}>{screening.hall.hall_type}</strong>
          <span className="chip-sep" aria-hidden="true">·</span>
          <span className="chip-hall-name">{screening.hall.name}</span>
        </span>
      </span>
    </Squircle>
  );
}
