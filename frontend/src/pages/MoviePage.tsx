import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../api/client";
import { Age, Poster, ShowtimeChip } from "../components/MovieRow";
import { ArrowLeftIcon } from "../components/TabIcons";
import { Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { type MovieWithScreenings, movieKey } from "../lib/catalogCache";
import { type Screening, dayOf, nextDays, runtime } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { must, useApi } from "../lib/useApi";

export function MoviePage() {
  const { locale, t } = useI18n();
  const movieId = Number(useParams().id);
  const [params] = useSearchParams();
  const selectedDay = params.get("day");
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const page = useApi<MovieWithScreenings>(async () => {
    const path = { path: { movie_id: movieId } };
    const [movie, screenings] = await Promise.all([
      api.GET("/api/movies/{movie_id}", { params: path }).then(must),
      api.GET("/api/movies/{movie_id}/screenings", { params: path }).then(must),
    ]);
    return { movie, screenings };
  }, movieId, movieKey(movieId));

  if (page.state === "loading") {
    return (
      <Card as="article" elevated className="movie-card" aria-busy="true">
        <div className="movie-hero">
          <div className="movie-hero-poster">
            <Skeleton radius={4} className="poster-squircle" />
          </div>
          <div className="movie-hero-info movie-info-skeleton">
            <Skeleton width="60%" height="2rem" radius={8} />
            <Skeleton width="42%" height="1.15rem" radius={6} style={{ marginTop: "0.5rem" }} />
            <Skeleton width="100%" height="3.25rem" radius={8} style={{ marginTop: "1rem" }} />
          </div>
        </div>
        <div className="movie-schedule">
          <Skeleton width="9rem" height="1.35rem" radius={6} />
          <Skeleton width="100%" height="2.75rem" radius={10} style={{ marginTop: "0.75rem" }} />
          <Skeleton width="100%" height="5.5rem" radius={10} style={{ marginTop: "0.75rem" }} />
        </div>
      </Card>
    );
  }

  if (page.state === "error") {
    return (
      <FadeIn direction="up">
        <ErrorState
          title={t("movie.loadErrorTitle")}
          message={t("movie.loadErrorMsg")}
          details={page.message}
          onRetry={page.reload}
        />
      </FadeIn>
    );
  }

  const { movie, screenings } = page.data;
  const byDay = new Map<string, Screening[]>();
  for (const s of screenings) {
    const key = dayOf(s.start_time);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const facts = [
    ...movie.genres,
    runtime(movie.duration_min, t("movie.hoursShort"), t("movie.minShort")),
    movie.release_year,
  ];

  const activeDays = nextDays(7, locale, t("program.today")).filter((d) => byDay.has(d.iso));
  const activeDayIso =
    (pickedDay && byDay.has(pickedDay) ? pickedDay : null) ??
    (selectedDay && byDay.has(selectedDay) ? selectedDay : null) ??
    activeDays[0]?.iso ??
    null;
  const currentScreenings = activeDayIso ? (byDay.get(activeDayIso) ?? []) : [];

  return (
    <FadeIn direction="up">
      <div className="back-row">
        <Link
          to={selectedDay ? `/?day=${encodeURIComponent(selectedDay)}` : "/"}
          className="back-btn"
          aria-label={t("nav.backWhatsOn")}
        >
          <span className="back-btn-circle">
            <ArrowLeftIcon />
          </span>
          <span className="back-btn-label">{t("nav.backWhatsOn")}</span>
        </Link>
      </div>

      <Card as="article" elevated className="movie-card">
        <div className="movie-hero">
          <div className="movie-hero-poster">
            <Poster movie={movie} priority />
          </div>
          <div className="movie-hero-head">
            <div className="title">
              <h1>{movie.title}</h1>
              <Age minAge={movie.min_age} />
            </div>
            <p className="meta">{facts.filter(Boolean).join(" · ")}</p>
          </div>
          {movie.description && <p className="movie-hero-lead">{movie.description}</p>}
        </div>

        <div className="movie-schedule">
          <h2>{t("movie.screenings")}</h2>
          {activeDays.length === 0 ? (
            <EmptyState
              title={t("movie.noUpcomingTitle")}
              description={t("movie.noUpcomingDesc")}
            />
          ) : (
            <>
              <div className="movie-days" role="tablist" aria-label={t("program.dayGroup")}>
                {activeDays.map((d) => {
                  const selected = d.iso === activeDayIso;
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`movie-day-pill${selected ? " movie-day-pill-active" : ""}`}
                      onClick={() => setPickedDay(d.iso)}
                    >
                      <span className="movie-day-weekday">{d.weekday}</span>
                      <b className="movie-day-date">{d.date}</b>
                    </button>
                  );
                })}
              </div>

              <div className="movie-times" role="tabpanel">
                {currentScreenings.map((s) => (
                  <ShowtimeChip key={s.screening_id} screening={s} />
                ))}
              </div>
            </>
          )}
        </div>
      </Card>
    </FadeIn>
  );
}
