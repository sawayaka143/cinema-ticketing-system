import { Link } from "react-router";
import { type Movie, type Screening, price, runtime } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Age, Poster } from "./MovieRow";

/** Poster-first tile used in the 2-column phone storefront. */
export function MovieTile({
  movie,
  screenings = [],
  dayIso,
  priority = false,
}: {
  movie: Movie;
  screenings?: Screening[];
  dayIso?: string;
  priority?: boolean;
}) {
  const { t } = useI18n();
  const minPrice = screenings.reduce((min, s) => {
    const val = Number(s.base_price);
    return Number.isFinite(val) && val < min ? val : min;
  }, Infinity);
  const showtimesSummary =
    screenings.length > 0 && Number.isFinite(minPrice)
      ? screenings.length === 1
        ? t("program.showtimesOne", { count: screenings.length, price: price(String(minPrice)) })
        : t("program.showtimesMany", { count: screenings.length, price: price(String(minPrice)) })
      : null;

  const to = dayIso ? `/movies/${movie.movie_id}?day=${encodeURIComponent(dayIso)}` : `/movies/${movie.movie_id}`;

  return (
    <Link to={to} className="movie-tile">
      <Poster movie={movie} priority={priority} />
      <span className="tile-title-row">
        <span className="tile-title">{movie.title}</span>
        <Age minAge={movie.min_age} />
      </span>
      <span className="tile-meta">
        {[movie.genres[0], runtime(movie.duration_min, t("movie.hoursShort"), t("movie.minShort"))]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {showtimesSummary && <span className="tile-showtimes">{showtimesSummary}</span>}
    </Link>
  );
}
