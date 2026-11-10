import { Link } from "react-router";
import { type Movie, type Screening, runtime } from "../lib/format";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { ShowtimeChip } from "./ui/ShowtimeChip";
import { Squircle } from "./ui/Squircle";

export function Poster({ movie }: { movie: Movie }) {
  return (
    <Squircle
      radius={14}
      smoothing={0.65}
      clipContent
      shadow="subtle"
      className="poster-squircle"
      style={{ width: 104, height: 150, flexShrink: 0 }}
    >
      {movie.poster_url ? (
        <img
          className="poster-img"
          src={movie.poster_url}
          alt={movie.title}
          loading="lazy"
          width={104}
          height={150}
        />
      ) : (
        <div className="poster-empty" aria-hidden="true" />
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

export function MovieRow({ movie, screenings }: { movie: Movie; screenings: Screening[] }) {
  return (
    <Card hoverable className="film-card">
      <div className="film-layout">
        <Poster movie={movie} />
        <div className="film-details">
          <div className="title">
            <h2>
              <Link to={`/movies/${movie.movie_id}`}>{movie.title}</Link>
            </h2>
            <Age minAge={movie.min_age} />
          </div>
          <p className="meta">{[...movie.genres, runtime(movie.duration_min)].join(" · ")}</p>
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
