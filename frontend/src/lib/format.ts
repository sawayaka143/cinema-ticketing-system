import type { components } from "../api/schema";

export type Movie = components["schemas"]["MovieOut"];
export type Screening = components["schemas"]["ScreeningOut"];
export type ScreeningDetail = components["schemas"]["ScreeningDetail"];

const TZ = "Asia/Almaty";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD

/** "19:30–21:59": a screening always shows its real span. */
export function span(s: { start_time: string; end_time: string }) {
  return `${timeFmt.format(new Date(s.start_time))}–${timeFmt.format(new Date(s.end_time))}`;
}

export function runtime(min: number) {
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function price(value: string) {
  return `${Math.round(Number(value)).toLocaleString("ru-RU")} ₸`;
}

export type Day = { iso: string; weekday: string; date: string };

/** Today and the next 6 days, in Almaty time. */
export function nextDays(count = 7): Day[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return { iso: isoFmt.format(d), weekday: i === 0 ? "Today" : dayFmt.format(d), date: dateFmt.format(d) };
  });
}

export function dayOf(iso: string) {
  return isoFmt.format(new Date(iso));
}
