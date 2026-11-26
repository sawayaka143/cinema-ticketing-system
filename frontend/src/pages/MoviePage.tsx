import { Link, useParams, useSearchParams } from "react-router";
import { api } from "../api/client";
import { Age, Poster, ShowtimeChip } from "../components/MovieRow";
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
        <div className="movie-layout">
          <Skeleton radius={4} className="poster-squircle" />
          <div className="movie-info movie-info-skeleton">
            <Skeleton width="60%" height="2rem" radius={8} />
            <Skeleton width="40%" height="1.2rem" radius={6} style={{ marginTop: "0.5rem" }} />
            <Skeleton width="100%" height="4rem" radius={8} style={{ marginTop: "1rem" }} />
          </div>
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
  const orderedDays =
    selectedDay && byDay.has(selectedDay)
      ? [
          ...activeDays.filter((d) => d.iso === selectedDay),
          ...activeDays.filter((d) => d.iso !== selectedDay),
        ]
      : activeDays;

  return (
    <FadeIn direction="up">
      <p className="back-link">
        <Link to={selectedDay ? `/?day=${encodeURIComponent(selectedDay)}` : "/"}>← {t("nav.backWhatsOn")}</Link>
      </p>
      <Card as="article" elevated className="movie-card">
        <div className="movie-layout">
          <div className="movie-poster-col">
            <Poster movie={movie} priority />
          </div>
          <div className="movie-header-col">
            <div className="title">
              <h1>{movie.title}</h1>
              <Age minAge={movie.min_age} />
            </div>
            <p className="meta">{facts.filter(Boolean).join(" · ")}</p>
          </div>
          <div className="movie-body-col">
            {movie.description && <p className="lead">{movie.description}</p>}
            <h2>{t("movie.screenings")}</h2>
            {screenings.length === 0 && (
              <EmptyState
                title={t("movie.noUpcomingTitle")}
                description={t("movie.noUpcomingDesc")}
              />
            )}
            {orderedDays.map((d) => (
              <section
                key={d.iso}
                className={`day-group${selectedDay === d.iso ? " day-group-selected" : ""}`}
              >
                <h3>
                  {d.weekday}, {d.date}
                </h3>
                <div className="times">
                  {byDay.get(d.iso)?.map((s) => (
                    <ShowtimeChip key={s.screening_id} screening={s} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Card>
    </FadeIn>
  );
}
