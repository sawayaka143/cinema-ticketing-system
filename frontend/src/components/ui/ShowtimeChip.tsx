import { Link } from "react-router";
import { type Screening, span } from "../../lib/format";
import { Squircle } from "./Squircle";

export interface ShowtimeChipProps {
  screening?: Screening;
  s?: Screening;
  className?: string;
}

export function ShowtimeChip({ screening, s, className = "" }: ShowtimeChipProps) {
  const item = screening ?? s;
  if (!item) return null;

  return (
    <Squircle
      as={Link}
      to={`/screenings/${item.screening_id}`}
      radius={12}
      smoothing={0.65}
      fill="var(--surface-2)"
      stroke="var(--border)"
      strokeWidth={1}
      shadow="subtle"
      className={`showtime-chip ${className}`}
    >
      <div className="chip-content">
        <span className="chip-hall">
          <strong className="chip-type">{item.hall.hall_type}</strong> · {item.hall.name}
        </span>
        <b className="chip-time">{span(item)}</b>
      </div>
    </Squircle>
  );
}
