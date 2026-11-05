import { useSearchParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { MovieRow } from "../components/MovieRow";
import { nextDays } from "../lib/format";
import { must, useApi } from "../lib/useApi";

export function MoviesPage() {
  const days = nextDays();
  const [params, setParams] = useSearchParams();
  const day = days.find((d) => d.iso === params.get("day")) ?? days[0];

  const program = useApi(async () => {
    const movies = must(await api.GET("/api/movies"));
    const rows = await Promise.all(
      movies.map(async (movie) => ({
        movie,
        screenings: must(
          await api.GET("/api/movies/{movie_id}/screenings", {
            params: { path: { movie_id: movie.movie_id }, query: { date: day.iso } },
          }),
        ),
      })),
    );
    return rows.filter((r) => r.screenings.length > 0);
  }, day.iso);

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
      {program.state === "loading" && <Status>Loading the program…</Status>}
      {program.state === "error" && (
        <Status tone="error">
          Couldn&apos;t load the program: {program.message}. Try again in a minute.
        </Status>
      )}
      {program.state === "ready" && program.data.length === 0 && (
        <Status>No screenings left on this day. Pick another day above.</Status>
      )}
      {program.state === "ready" &&
        program.data.map(({ movie, screenings }) => (
          <MovieRow key={movie.movie_id} movie={movie} screenings={screenings} />
        ))}
    </>
  );
}
