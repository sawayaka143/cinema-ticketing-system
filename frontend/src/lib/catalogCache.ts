import type { Movie, Screening, ScreeningDetail } from "./format";
import { primeCache } from "./useApi";

/** Cache keys shared by the pages that show catalog data. */
export const WEEK_KEY = "week";
export const movieKey = (movieId: number) => `movie:${movieId}`;
export const screeningKey = (screeningId: number) => `screening:${screeningId}`;

export type MovieWithScreenings = { movie: Movie; screenings: Screening[] };

export function toScreening(s: ScreeningDetail): Screening {
  return {
    screening_id: s.screening_id,
    movie_id: s.movie_id,
    hall: s.hall,
    start_time: s.start_time,
    end_time: s.end_time,
    base_price: s.base_price,
  };
}

/**
 * The week's program already holds every film and showtime the film and hall pages open with,
 * so store them under those pages' keys: a click then paints at once and refreshes behind.
 */
export function primeFromWeek(week: ScreeningDetail[]) {
  const byMovie = new Map<number, MovieWithScreenings>();
  for (const s of week) {
    primeCache<ScreeningDetail>(screeningKey(s.screening_id), s);
    let entry = byMovie.get(s.movie.movie_id);
    if (!entry) {
      entry = { movie: s.movie, screenings: [] };
      byMovie.set(s.movie.movie_id, entry);
    }
    entry.screenings.push(toScreening(s));
  }
  for (const [movieId, entry] of byMovie) primeCache(movieKey(movieId), entry);
}
