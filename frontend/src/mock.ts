// Static mock content for the placeholder front-end (issue #17). Every title, synopsis and
// price here is invented demo data; the real app (issue #14) loads everything from the API.

export type Shape = "peaks" | "sun" | "bands" | "split" | "ring" | "grid";

export type Movie = {
  id: string;
  title: string;
  genre: string;
  age: string;
  minutes: number;
  synopsis: string;
  poster: { bg: string; fg: string; shape: Shape };
};

export const MOVIES: Movie[] = [
  { id: "last-tram", title: "The Last Tram to Medeu", genre: "Drama", age: "12+", minutes: 118,
    synopsis: "A night driver and a lost violinist ride the final tram of the season up the mountain road.",
    poster: { bg: "#2f5d50", fg: "#e6efe0", shape: "peaks" } },
  { id: "steppe-radio", title: "Steppe Radio", genre: "Comedy", age: "6+", minutes: 96,
    synopsis: "Three cousins revive their grandfather's village radio station for one chaotic weekend.",
    poster: { bg: "#e9d9a6", fg: "#2a2a1c", shape: "bands" } },
  { id: "paper-satellites", title: "Paper Satellites", genre: "Sci-fi", age: "12+", minutes: 132,
    synopsis: "A school robotics club picks up a signal that nobody else on Earth can hear.",
    poster: { bg: "#1f3a5f", fg: "#d6e4f0", shape: "ring" } },
  { id: "nine-winters", title: "Nine Winters", genre: "Thriller", age: "16+", minutes: 124,
    synopsis: "An avalanche ranger finds the same footprints in the snow every winter for nine years.",
    poster: { bg: "#d8e1d2", fg: "#1d3b2f", shape: "split" } },
  { id: "small-hours", title: "Small Hours at Kok-Tobe", genre: "Romance", age: "16+", minutes: 107,
    synopsis: "Two strangers miss the last cable car down and have until sunrise to talk.",
    poster: { bg: "#7a2e2e", fg: "#f0d9cf", shape: "sun" } },
  { id: "glass-orchard", title: "The Glass Orchard", genre: "Animation", age: "0+", minutes: 88,
    synopsis: "A young gardener grows apples that ring like bells, and the whole city wants one.",
    poster: { bg: "#b8c4ce", fg: "#16232c", shape: "grid" } },
];

export type Hall = { name: string; format: "2D" | "3D" | "IMAX"; price: number };

export const HALLS: Hall[] = [
  { name: "Hall 1", format: "2D", price: 2500 },
  { name: "Hall 2", format: "3D", price: 3200 },
  { name: "Hall 3", format: "IMAX", price: 4200 },
];

const TIMES = ["10:40", "13:15", "16:00", "18:30", "21:10", "23:20"];

/** Showtimes for one movie: a fixed pseudo-schedule, the same every day. */
export function showtimes(movieIndex: number) {
  return HALLS.map((hall, h) => ({
    hall,
    times: TIMES.filter((_, t) => (t + movieIndex + h) % 3 !== 0),
  }));
}

export const ROWS = "ABCDEFGH".split("");
export const SEATS_PER_ROW = 12;
export const AISLES = [3, 9]; // an aisle after seats 3 and 9

export type SeatKind = "standard" | "vip" | "wheelchair";

export function seatKind(row: string, n: number): SeatKind {
  if (row === "A" && (n === 1 || n === SEATS_PER_ROW)) return "wheelchair";
  return row === "H" ? "vip" : "standard";
}

/** Deterministic "already sold" seats so the map looks lived-in. */
export function isTaken(seed: string, row: string, n: number) {
  let h = 0;
  for (const c of seed + row + n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 10 < 3;
}

export const tenge = (n: number) => `${n.toLocaleString("en-US").replace(/,/g, " ")} ₸`;
export const runtime = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;
