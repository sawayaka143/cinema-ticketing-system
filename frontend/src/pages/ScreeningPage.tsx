import { Link, useParams } from "react-router";
import { api } from "../api/client";
import { Status } from "../components/Layout";
import { Card } from "../components/ui/Card";
import { ErrorState } from "../components/ui/ErrorState";
import { FadeIn } from "../components/ui/FadeIn";
import { Skeleton } from "../components/ui/Skeleton";
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

  if (page.state === "loading") {
    return (
      <Card as="section" elevated className="panel" aria-busy="true">
        <Skeleton width="30%" height="1.2rem" radius={6} />
        <Skeleton width="60%" height="2rem" radius={8} style={{ marginTop: "0.5rem" }} />
        <Skeleton width="40%" height="1.2rem" radius={6} style={{ marginTop: "0.5rem" }} />
      </Card>
    );
  }

  if (page.state === "error") {
    return (
      <FadeIn direction="up">
        <ErrorState
          title="Screening not found"
          message="We couldn't load this screening session. It may have expired or been rescheduled."
          details={page.message}
          onRetry={page.reload}
        />
      </FadeIn>
    );
  }

  const s = page.data;

  return (
    <FadeIn direction="up">
      <Card as="section" elevated className="panel">
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
      </Card>
    </FadeIn>
  );
}
