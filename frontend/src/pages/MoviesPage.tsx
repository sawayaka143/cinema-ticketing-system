import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { MovieRow } from "../components/MovieRow";
import { EmptyState, ErrorState, ProgramSkeleton } from "../components/ui";
import {
  type Movie,
  type Screening,
  type ScreeningDetail,
  dayOf,
  nextDays,
} from "../lib/format";
import { must, useApi } from "../lib/useApi";

type DayMovieRow = { movie: Movie; screenings: Screening[] };

function groupByMovieForDay(screenings: ScreeningDetail[], dayIso: string): DayMovieRow[] {
  const byMovie = new Map<number, DayMovieRow>();
  for (const s of screenings) {
    if (dayOf(s.start_time) !== dayIso) continue;
    let entry = byMovie.get(s.movie.movie_id);
    if (!entry) {
      entry = { movie: s.movie, screenings: [] };
      byMovie.set(s.movie.movie_id, entry);
    }
    entry.screenings.push({
      screening_id: s.screening_id,
      movie_id: s.movie_id,
      hall: s.hall,
      start_time: s.start_time,
      end_time: s.end_time,
      base_price: s.base_price,
    });
  }
  return Array.from(byMovie.values()).sort((a, b) => a.movie.title.localeCompare(b.movie.title));
}

export function MoviesPage() {
  const days = useMemo(() => nextDays(), []);
  const [params, setParams] = useSearchParams();
  const day = days.find((d) => d.iso === params.get("day")) ?? days[0];

  const week = useApi(async () => must(await api.GET("/api/screenings")), "week");

  const rows = useMemo(
    () => (week.state === "ready" ? groupByMovieForDay(week.data, day.iso) : []),
    [week, day.iso],
  );

  return (
    <>
      <div className="days" role="group" aria-label="Day">
        {days.map((d) => (
          <button
            key={d.iso}
            type="button"
            aria-pressed={d.iso === day.iso}
            className="day"
            onClick={() => setParams(d.iso === days[0].iso ? {} : { day: d.iso })}
          >
            {d.weekday}
            <b>{d.date}</b>
          </button>
        ))}
      </div>
      <h1>{day.weekday === "Today" ? "Today at Alatau" : `${day.weekday}, ${day.date}`}</h1>
      {week.state === "loading" && <ProgramSkeleton count={3} />}
      {week.state === "error" && (
        <ErrorState
          title="Couldn't load the program"
          message="We had trouble reaching the box office. Check your connection and try again."
          details={week.message}
          onRetry={week.reload}
        />
      )}
      {week.state === "ready" && rows.length === 0 && (
        <EmptyState
          title="No screenings left on this day"
          description="All screenings for this date have passed or none are scheduled. Pick another day above."
        />
      )}
      {week.state === "ready" && rows.length > 0 && (
        <div className="films-stack">
          {rows.map(({ movie, screenings }) => (
            <MovieRow key={movie.movie_id} movie={movie} screenings={screenings} />
          ))}
        </div>
      )}
    </>
  );
}
