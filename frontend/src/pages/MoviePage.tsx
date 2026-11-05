import { useParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { Age, Poster, ShowtimeChip } from "../components/MovieRow";
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

  if (page.state === "loading") return <Status>Loading…</Status>;
  if (page.state === "error") return <Status tone="error">{page.message}</Status>;

  const { movie, screenings } = page.data;
  const byDay = new Map<string, Screening[]>();
  for (const s of screenings) {
    const key = dayOf(s.start_time);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const facts = [...movie.genres, runtime(movie.duration_min), movie.release_year];

  return (
    <article className="movie">
      <Poster movie={movie} />
      <div>
        <div className="title">
          <h1>{movie.title}</h1>
          <Age minAge={movie.min_age} />
        </div>
        <p className="meta">{facts.filter(Boolean).join(" · ")}</p>
        {movie.description && <p className="lead">{movie.description}</p>}
        <h2>Screenings</h2>
        {screenings.length === 0 && <Status>No screenings in the next 7 days.</Status>}
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
    </article>
  );
}
