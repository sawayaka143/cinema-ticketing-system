import { Link } from "react-router";
import { type Movie, type Screening, runtime } from "../lib/format";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { ShowtimeChip } from "./ui/ShowtimeChip";
import { Squircle } from "./ui/Squircle";

export function Poster({ movie, priority = false }: { movie: Movie; priority?: boolean }) {
  return (
    <Squircle
      radius={4}
      smoothing={0.5}
      stroke="var(--border)"
      strokeWidth={1}
      clipContent
      shadow="none"
      className="poster-squircle"
    >
      {movie.poster_url ? (
        <img
          className="poster-img"
          src={movie.poster_url}
          alt={movie.title}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          width={144}
          height={216}
        />
      ) : (
        <span className="poster-empty" aria-hidden="true" />
      )}
    </Squircle>
  );
}

export function Age({ minAge }: { minAge: number }) {
  return (
    <Badge
      tone="neutral"
      variant="outline"
      aria-label={`Age ${minAge} and over`}
      className="age-badge"
    >
      {minAge}+
    </Badge>
  );
}

export { ShowtimeChip } from "./ui/ShowtimeChip";

export function MovieRow({ movie, screenings, priority = false }: { movie: Movie; screenings: Screening[]; priority?: boolean }) {
  return (
    <Card className="film-card">
      <div className="film-layout">
        <Link to={`/movies/${movie.movie_id}`} className="poster-link" tabIndex={-1} aria-hidden="true">
          <Poster movie={movie} priority={priority} />
        </Link>
        <div className="film-details">
          <div className="film-head">
            <div className="title">
              <h2>
                <Link to={`/movies/${movie.movie_id}`}>{movie.title}</Link>
              </h2>
              <Age minAge={movie.min_age} />
            </div>
            <p className="meta">{[...movie.genres, runtime(movie.duration_min)].join(" · ")}</p>
            {movie.description && <p className="film-synopsis">{movie.description}</p>}
          </div>
          <div className="times">
            {screenings.map((s) => (
              <ShowtimeChip key={s.screening_id} screening={s} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
