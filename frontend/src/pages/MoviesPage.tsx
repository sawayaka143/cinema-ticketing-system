import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { MovieRow } from "../components/MovieRow";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { FadeIn } from "../components/ui/FadeIn";
import { ProgramSkeleton } from "../components/ui/Skeleton";
import { Squircle } from "../components/ui/Squircle";
import {
  type Movie,
  type Screening,
  type ScreeningDetail,
  dayOf,
  nextDays,
} from "../lib/format";
import { must } from "../lib/useApi";

type DayProgram = { movie: Movie; screenings: Screening[] }[];

function groupScreenings(screenings: ScreeningDetail[]): DayProgram {
  const map = new Map<number, { movie: Movie; screenings: Screening[] }>();
  for (const s of screenings) {
    let entry = map.get(s.movie.movie_id);
    if (!entry) {
      entry = { movie: s.movie, screenings: [] };
      map.set(s.movie.movie_id, entry);
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
  return Array.from(map.values()).sort((a, b) => a.movie.title.localeCompare(b.movie.title));
}

// In-memory cache for 7-day program: persists across tab switches and back-navigation
const programCache = new Map<string, DayProgram>();

export function MoviesPage() {
  const days = useMemo(() => nextDays(), []);
  const [params, setParams] = useSearchParams();
  const day = days.find((d) => d.iso === params.get("day")) ?? days[0];

  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Derive cached program directly during render: 0ms delay on tab switch
  const cachedProgram = programCache.get(day.iso);
  const isLoaded = programCache.has(day.iso);

  const reload = useCallback(() => {
    programCache.delete(day.iso);
    setError(null);
    setVersion((v) => v + 1);
  }, [day.iso]);

  // On-demand loader for the active day if not yet in cache
  useEffect(() => {
    if (programCache.has(day.iso)) return;

    let live = true;
    api
      .GET("/api/screenings", {
        params: { query: { date: day.iso } },
      })
      .then((res) => {
        if (!live) return;
        const screenings = must(res);
        const grouped = groupScreenings(screenings);
        programCache.set(day.iso, grouped);
        setVersion((v) => v + 1);
      })
      .catch((err: unknown) => {
        if (!live) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      });

    return () => {
      live = false;
    };
  }, [day.iso]);

  // Background prefetch for all 7 days right after mount
  const hasPrefetched = useRef(false);
  useEffect(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;

    api
      .GET("/api/screenings")
      .then((res) => {
        const allScreenings = must(res);
        for (const d of days) {
          const dayScreenings = allScreenings.filter((s) => dayOf(s.start_time) === d.iso);
          const grouped = groupScreenings(dayScreenings);
          programCache.set(d.iso, grouped);
        }
        setVersion((v) => v + 1);
      })
      .catch(() => {
        // Background prefetch is an optimization; errors are ignored
      });
  }, [days]);

  return (
    <>
      <div className="days" role="group" aria-label="Day">
        {days.map((d) => {
          const isSelected = d.iso === day.iso;
          return (
            <Squircle
              key={d.iso}
              as="button"
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

      <header className="page-header">
        <h1>{day.weekday === "Today" ? "Today at Alatau" : `${day.weekday}, ${day.date}`}</h1>
      </header>

      {error && !isLoaded && (
        <FadeIn direction="up">
          <ErrorState
            title="Couldn't load today's schedule"
            message="We had trouble reaching the ticketing box office. Check your connection or retry."
            details={error}
            onRetry={reload}
          />
        </FadeIn>
      )}

      {!isLoaded && !error && <ProgramSkeleton count={3} />}

      {cachedProgram && cachedProgram.length === 0 && (
        <FadeIn direction="up">
          <EmptyState
            title="No screenings remaining on this day"
            description="All screenings for this date have passed or none are scheduled. Choose another date above to view upcoming showtimes."
          />
        </FadeIn>
      )}

      {cachedProgram && cachedProgram.length > 0 && (
        <div className="films-stack">
          {cachedProgram.map(({ movie, screenings }, index) => (
            <FadeIn key={movie.movie_id} delay={index * 50} direction="up">
              <MovieRow movie={movie} screenings={screenings} />
            </FadeIn>
          ))}
        </div>
      )}
    </>
  );
}
