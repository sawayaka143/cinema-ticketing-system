import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { MovieRow } from "../components/MovieRow";
import { EmptyState, ErrorState, FadeIn, ProgramSkeleton, Squircle } from "../components/ui";
import {
  type Movie,
  type Screening,
  type ScreeningDetail,
  dayOf,
  nextDays,
} from "../lib/format";
import { WEEK_KEY, primeFromWeek, toScreening } from "../lib/catalogCache";
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
    entry.screenings.push(toScreening(s));
  }
  return Array.from(byMovie.values()).sort((a, b) => a.movie.title.localeCompare(b.movie.title));
}

export function MoviesPage() {
  const days = useMemo(() => nextDays(), []);
  const [params, setParams] = useSearchParams();
  const day = days.find((d) => d.iso === params.get("day")) ?? days[0];

  const week = useApi(
    async () => {
      const data = must(await api.GET("/api/screenings"));
      primeFromWeek(data);
      return data;
    },
    "week",
    WEEK_KEY,
  );

  const rows = useMemo(
    () => (week.state === "ready" ? groupByMovieForDay(week.data, day.iso) : []),
    [week, day.iso],
  );

  return (
    <>
      <div className="days" role="group" aria-label="Day">
        {days.map((d) => {
          const isSelected = d.iso === day.iso;
          return (
            <Squircle
              key={d.iso}
              as="button"
              type="button"
              radius={12}
              smoothing={0.65}
              fill={isSelected ? "var(--accent)" : "var(--surface)"}
              stroke={isSelected ? "transparent" : "var(--border)"}
              strokeWidth={1}
              shadow="none"
              aria-pressed={isSelected}
              className={`day-tab ${isSelected ? "day-tab-active" : ""}`}
              onClick={() => setParams(d.iso === days[0].iso ? {} : { day: d.iso })}
            >
              <span className="day-tab-label">{d.weekday}</span>
              <b className="day-tab-date">{d.date}</b>
            </Squircle>
          );
        })}
      </div>
      <h1>{day.weekday === "Today" ? "Today at Alatau" : `${day.weekday}, ${day.date}`}</h1>
      {week.state === "loading" && <ProgramSkeleton count={3} />}
      {week.state === "error" && (
        <FadeIn direction="up">
          <ErrorState
            title="Couldn't load the program"
            message="We had trouble reaching the box office. Check your connection and try again."
            details={week.message}
            onRetry={week.reload}
          />
        </FadeIn>
      )}
      {week.state === "ready" && rows.length === 0 && (
        <FadeIn direction="up">
          <EmptyState
            title="No screenings left on this day"
            description="All screenings for this date have passed or none are scheduled. Pick another day above."
          />
        </FadeIn>
      )}
      {week.state === "ready" && rows.length > 0 && (
        <div className="films-stack">
          {rows.map(({ movie, screenings }, index) => (
            <FadeIn key={movie.movie_id} delay={index * 50} direction="up">
              <MovieRow movie={movie} screenings={screenings} priority={index < 2} />
            </FadeIn>
          ))}
        </div>
      )}
    </>
  );
}
