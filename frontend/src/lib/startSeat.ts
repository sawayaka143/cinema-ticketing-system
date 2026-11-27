import type { Seat } from "./format";

/**
 * The seat the 3D hall opens on: the middle of the back row. When the middle seats there are
 * taken, the middle of the row in front, and so on to the front. If every middle seat is taken,
 * the free seat closest to the back middle. Null when the whole hall is taken.
 */
export function startSeat(seats: Seat[]): Seat | null {
  const free = seats.filter((s) => !s.is_taken);
  if (!free.length) return null;
  const maxCol = Math.max(...seats.map((s) => s.grid_col));
  const middle = (maxCol + 1) / 2;
  const fromMiddle = (s: Seat) => Math.abs(s.grid_col - middle);
  const rows = [...new Set(seats.map((s) => s.grid_row))].sort((a, b) => b - a); // back first

  for (const row of rows) {
    const inRow = seats.filter((s) => s.grid_row === row);
    const closest = Math.min(...inRow.map(fromMiddle));
    // With an even number of columns two seats share the middle.
    const middleSeats = inRow.filter((s) => fromMiddle(s) === closest && !s.is_taken);
    if (middleSeats.length) return middleSeats[0];
  }

  const back = rows[0];
  return free.reduce((best, s) => {
    const score = (x: Seat) => fromMiddle(x) + (back - x.grid_row) * 1.5;
    return score(s) < score(best) ? s : best;
  });
}
