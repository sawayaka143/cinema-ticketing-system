import { api } from "../api/client";
import type { Movie, Screening, ScreeningDetail, SeatMapData } from "./format";
import { must, primeCache } from "./useApi";

/** Cache keys shared by the pages that show catalog data. */
export const WEEK_KEY = "week";
export const movieKey = (movieId: number) => `movie:${movieId}`;
export const screeningKey = (screeningId: number) => `screening:${screeningId}`;

export type MovieWithScreenings = { movie: Movie; screenings: Screening[] };

const SEAT_PREFETCH_TTL_MS = 10_000;
const prefetchedSeats = new Map<number, { data: SeatMapData; fetchedAt: number }>();
const inFlightSeats = new Map<number, Promise<SeatMapData>>();

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

/** Warms the seat map endpoint on chip hover/focus/touch so navigation renders immediately. */
export function prefetchSeatMap(screeningId: number): void {
  const existing = prefetchedSeats.get(screeningId);
  if (existing && Date.now() - existing.fetchedAt < SEAT_PREFETCH_TTL_MS) return;
  if (inFlightSeats.has(screeningId)) return;

  const promise = api
    .GET("/api/screenings/{screening_id}/seats", {
      params: { path: { screening_id: screeningId } },
    })
    .then(must)
    .then((data) => {
      prefetchedSeats.set(screeningId, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      inFlightSeats.delete(screeningId);
    });

  inFlightSeats.set(screeningId, promise);
  void promise.catch(() => {
    // Silent prefetch failure: ScreeningPage handles live errors cleanly.
  });
}

/** Fetches the seat map, reusing a fresh (<10s) prefetch or in-flight request unless `fresh` is true. */
export function fetchSeatMap(screeningId: number, fresh = false): Promise<SeatMapData> {
  if (!fresh) {
    const cached = prefetchedSeats.get(screeningId);
    if (cached && Date.now() - cached.fetchedAt < SEAT_PREFETCH_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    const pending = inFlightSeats.get(screeningId);
    if (pending) return pending;
  }

  const promise = api
    .GET("/api/screenings/{screening_id}/seats", {
      params: { path: { screening_id: screeningId } },
    })
    .then(must)
    .then((data) => {
      prefetchedSeats.set(screeningId, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      inFlightSeats.delete(screeningId);
    });

  inFlightSeats.set(screeningId, promise);
  return promise;
}
