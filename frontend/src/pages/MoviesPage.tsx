import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { MovieRow } from "../components/MovieRow";
import { Button, EmptyState, ErrorState, FadeIn, ProgramSkeleton } from "../components/ui";
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

const FORMAT_ORDER = ["2D", "3D", "IMAX"];

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
  for (const entry of byMovie.values()) {
    entry.screenings.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return Array.from(byMovie.values()).sort((a, b) => {
    const timeDiff = a.screenings[0].start_time.localeCompare(b.screenings[0].start_time);
    return timeDiff !== 0 ? timeDiff : a.movie.title.localeCompare(b.movie.title);
  });
}

export function MoviesPage() {
  const days = useMemo(() => nextDays(), []);
  const [params, setParams] = useSearchParams();
  const [formatFilter, setFormatFilter] = useState<string>("ALL");
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

  const dayRows = useMemo(
    () => (week.state === "ready" ? groupByMovieForDay(week.data, day.iso) : []),
    [week, day.iso],
  );

  const availableFormats = useMemo(() => {
    const found = new Set<string>();
    for (const row of dayRows) {
      for (const s of row.screenings) found.add(s.hall.hall_type);
    }
    return Array.from(found).sort((a, b) => {
      const ai = FORMAT_ORDER.indexOf(a);
      const bi = FORMAT_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [dayRows]);

  const activeFormat =
    formatFilter === "ALL" || availableFormats.includes(formatFilter) ? formatFilter : "ALL";

  const rows = useMemo(() => {
    if (activeFormat === "ALL") return dayRows;
    return dayRows
      .map((row) => ({
        movie: row.movie,
        screenings: row.screenings.filter((s) => s.hall.hall_type === activeFormat),
      }))
      .filter((row) => row.screenings.length > 0);
  }, [dayRows, activeFormat]);

  const screeningCount = useMemo(
    () => rows.reduce((sum, r) => sum + r.screenings.length, 0),
    [rows],
  );

  const nextAvailableDay = useMemo(() => {
    if (week.state !== "ready") return null;
    const withScreenings = new Set(week.data.map((s) => dayOf(s.start_time)));
    return days.find((d) => d.iso !== day.iso && withScreenings.has(d.iso)) ?? null;
  }, [week, days, day.iso]);

  const selectDay = (iso: string) => {
    setFormatFilter("ALL");
    setParams(iso === days[0].iso ? {} : { day: iso });
  };

  return (
    <>
      <div className="days-wrap">
        <div className="days" role="group" aria-label="Program day">
          {days.map((d) => {
            const isSelected = d.iso === day.iso;
            return (
              <button
                key={d.iso}
                type="button"
                aria-pressed={isSelected}
                className={`day-tab ${isSelected ? "day-tab-active" : ""}`}
                onClick={() => selectDay(d.iso)}
              >
                <span className="day-tab-label">{d.weekday}</span>
                <b className="day-tab-date">{d.date}</b>
              </button>
            );
          })}
        </div>
      </div>

      <div className="program-head">
        <div className="program-title-block">
          <h1>{day.weekday === "Today" ? "Today at Alatau" : `${day.weekday}, ${day.date}`}</h1>
          {week.state === "ready" && rows.length > 0 && (
            <p className="program-sub">
              {rows.length} {rows.length === 1 ? "film" : "films"} · {screeningCount}{" "}
              {screeningCount === 1 ? "screening" : "screenings"} · Select a showtime to pick seats
              (10-min hold)
            </p>
          )}
        </div>
        {week.state === "ready" && availableFormats.length > 1 && (
          <div className="format-filters" role="group" aria-label="Filter by hall format">
            <button
              type="button"
              aria-pressed={activeFormat === "ALL"}
              className={`filter-pill ${activeFormat === "ALL" ? "filter-pill-active" : ""}`}
              onClick={() => setFormatFilter("ALL")}
            >
              All formats
            </button>
            {availableFormats.map((fmt) => (
              <button
                key={fmt}
                type="button"
                aria-pressed={activeFormat === fmt}
                className={`filter-pill ${activeFormat === fmt ? "filter-pill-active" : ""}`}
                onClick={() => setFormatFilter(fmt)}
              >
                {fmt}
              </button>
            ))}
          </div>
        )}
      </div>

      {week.state === "loading" && <ProgramSkeleton count={4} />}
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
            title={
              activeFormat !== "ALL"
                ? `No ${activeFormat} screenings on this day`
                : "No screenings left on this day"
            }
            description={
              activeFormat !== "ALL"
                ? "Try showing all hall formats or choose another day above."
                : "All screenings for this date have passed or none are scheduled."
            }
            action={
              activeFormat !== "ALL" ? (
                <Button variant="solid" size="sm" onClick={() => setFormatFilter("ALL")}>
                  Show all formats
                </Button>
              ) : nextAvailableDay ? (
                <Button variant="solid" size="sm" onClick={() => selectDay(nextAvailableDay.iso)}>
                  See {nextAvailableDay.weekday}, {nextAvailableDay.date}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={week.reload}>
                  Refresh program
                </Button>
              )
            }
          />
        </FadeIn>
      )}
      {week.state === "ready" && rows.length > 0 && (
        <div className="films-grid">
          {rows.map(({ movie, screenings }, index) => (
            <FadeIn key={movie.movie_id} delay={index * 40} direction="up">
              <MovieRow movie={movie} screenings={screenings} priority={index < 4} />
            </FadeIn>
          ))}
        </div>
      )}
    </>
  );
}
