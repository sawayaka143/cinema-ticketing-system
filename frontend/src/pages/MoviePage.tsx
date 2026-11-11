import { useParams } from "react-router";
import { api } from "../api/client";
import { Age, Poster, ShowtimeChip } from "../components/MovieRow";
import { Card, EmptyState, ErrorState, FadeIn, Skeleton } from "../components/ui";
import { type Screening, dayOf, nextDays, runtime } from "../lib/format";
import { must, useApi } from "../lib/useApi";

export function MoviePage() {
  const movieId = Number(useParams().id);
  const page = useApi(async () => {
    const path = { path: { movie_id: movieId } };
    const [movie, screenings] = await Promise.all([
      api.GET("/api/movies/{movie_id}", { params: path }).then(must),
      api.GET("/api/movies/{movie_id}/screenings", { params: path }).then(must),
    ]);
    return { movie, screenings };
  }, movieId);

  if (page.state === "loading") {
    return (
      <Card as="article" elevated className="movie-card" aria-busy="true">
        <div className="movie-layout">
          <Skeleton width={160} height={240} radius={14} />
          <div className="movie-info">
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
          title="Couldn't load movie details"
          message="We couldn't retrieve this film's information and showtimes. Please try again."
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
  const facts = [...movie.genres, runtime(movie.duration_min), movie.release_year];

  return (
    <FadeIn direction="up">
      <Card as="article" elevated className="movie-card">
        <div className="movie-layout">
          <Poster movie={movie} priority />
          <div className="movie-info">
            <div className="title">
              <h1>{movie.title}</h1>
              <Age minAge={movie.min_age} />
            </div>
            <p className="meta">{facts.filter(Boolean).join(" · ")}</p>
            {movie.description && <p className="lead">{movie.description}</p>}
            <h2>Screenings</h2>
            {screenings.length === 0 && (
              <EmptyState
                title="No upcoming screenings"
                description="There are currently no scheduled screenings for this movie in the next 7 days."
              />
            )}
            {nextDays()
              .filter((d) => byDay.has(d.iso))
              .map((d) => (
                <section key={d.iso} className="day-group">
                  <h3>
                    {d.weekday}, {d.date}
                  </h3>
                  <div className="times">
                    {byDay.get(d.iso)?.map((s) => (
                      <ShowtimeChip key={s.screening_id} s={s} />
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
