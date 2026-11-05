import { Link } from "react-router";
import { type Movie, type Screening, runtime, span } from "../lib/format";

export function Poster({ movie }: { movie: Movie }) {
  return movie.poster_url ? (
    <img className="poster" src={movie.poster_url} alt="" loading="lazy" width={104} height={150} />
  ) : (
    <div className="poster" aria-hidden="true" />
  );
}

export function Age({ minAge }: { minAge: number }) {
  return (
    <span className="age" aria-label={`Age ${minAge} and over`}>
      {minAge}+
    </span>
  );
}

export function ShowtimeChip({ s }: { s: Screening }) {
  return (
    <Link to={`/screenings/${s.screening_id}`} className="chip">
      {s.hall.hall_type} · {s.hall.name}
      <b>{span(s)}</b>
    </Link>
  );
}

export function MovieRow({ movie, screenings }: { movie: Movie; screenings: Screening[] }) {
  return (
    <article className="film">
      <Poster movie={movie} />
      <div>
        <div className="title">
          <h2>
            <Link to={`/movies/${movie.movie_id}`}>{movie.title}</Link>
          </h2>
          <Age minAge={movie.min_age} />
        </div>
        <p className="meta">{[...movie.genres, runtime(movie.duration_min)].join(" · ")}</p>
        <div className="times">
          {screenings.map((s) => (
            <ShowtimeChip key={s.screening_id} s={s} />
          ))}
        </div>
      </div>
    </article>
  );
}
