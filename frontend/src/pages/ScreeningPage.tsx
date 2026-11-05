import { Link, useParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { price, span } from "../lib/format";
import { must, useApi } from "../lib/useApi";

export function ScreeningPage() {
  const screeningId = Number(useParams().id);
  const page = useApi(
    () =>
      api
        .GET("/api/screenings/{screening_id}", { params: { path: { screening_id: screeningId } } })
        .then(must),
    screeningId,
  );

  if (page.state === "loading") return <Status>Loading…</Status>;
  if (page.state === "error") return <Status tone="error">{page.message}</Status>;
  const s = page.data;

  return (
    <section className="panel">
      <p className="kicker">
        <Link to={`/movies/${s.movie.movie_id}`}>{s.movie.title}</Link>
      </p>
      <h1>
        {s.hall.name} · {s.hall.hall_type}
      </h1>
      <p className="meta">
        {span(s)} · from {price(s.base_price)}
      </p>
      <Status>The seat map opens here in week 11.</Status>
    </section>
  );
}
