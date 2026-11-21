import { Link } from "react-router";
import { type Movie, runtime } from "../lib/format";
import { Age, Poster } from "./MovieRow";

/** Poster-first tile used in the 2-column phone storefront. */
export function MovieTile({ movie, priority = false }: { movie: Movie; priority?: boolean }) {
  return (
    <Link to={`/movies/${movie.movie_id}`} className="movie-tile">
      <Poster movie={movie} priority={priority} />
      <span className="tile-title-row">
        <span className="tile-title">{movie.title}</span>
        <Age minAge={movie.min_age} />
      </span>
      <span className="tile-meta">
        {[movie.genres[0], runtime(movie.duration_min)].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}
