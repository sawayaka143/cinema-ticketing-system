import type { components } from "../api/schema";

export type Movie = components["schemas"]["MovieOut"];
export type Screening = components["schemas"]["ScreeningOut"];
export type ScreeningDetail = components["schemas"]["ScreeningDetail"];
export type Seat = components["schemas"]["SeatOut"];
export type TicketType = components["schemas"]["TicketTypeOut"];
export type Booking = components["schemas"]["BookingOut"];
export type MyBooking = components["schemas"]["MyBookingOut"];
export type Me = components["schemas"]["Me"];
export type AdminMovie = components["schemas"]["AdminMovieOut"];
export type AdminScreening = components["schemas"]["AdminScreeningOut"];
export type AdminHall = components["schemas"]["AdminHallOut"];
export type ReportRow = components["schemas"]["ReportRow"];
export type StaffBooking = components["schemas"]["StaffBookingOut"];
export type CheckinOut = components["schemas"]["CheckinOut"];
export type RefundOut = components["schemas"]["RefundOut"];

const TZ = "Asia/Almaty";

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const isoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD

// Chromium's ICU often lacks full kk-KZ short weekday/month names and falls back to "M11" / "Fri".
const KK_WEEKDAYS = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"] as const;
const KK_MONTHS = ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"] as const;

function almatyParts(d: Date) {
  const shifted = new Date(d.getTime() + 5 * 3_600_000);
  return {
    dayOfWeek: shifted.getUTCDay(),
    dayOfMonth: shifted.getUTCDate(),
    monthIndex: shifted.getUTCMonth(),
  };
}

function formatWeekday(d: Date, locale: string) {
  if (locale.startsWith("kk")) return KK_WEEKDAYS[almatyParts(d).dayOfWeek];
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short" }).format(d);
}

function formatShortDate(d: Date, locale: string) {
  if (locale.startsWith("kk")) {
    const { dayOfMonth, monthIndex } = almatyParts(d);
    return `${dayOfMonth} ${KK_MONTHS[monthIndex]}`;
  }
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "numeric", month: "short" }).format(d);
}

/** "Fri 7 Nov, 19:30" in Almaty time. */
export function when(iso: string, locale = "en-GB") {
  const d = new Date(iso);
  return `${formatWeekday(d, locale)} ${formatShortDate(d, locale)}, ${timeFmt.format(d)}`;
}

/** "9:41": minutes and seconds for the hold countdown. */
export function clock(seconds: number) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "19:30": single Almaty wall-clock time. */
export function timeOf(iso: string) {
  return timeFmt.format(new Date(iso));
}

/** "19:30–21:59": a screening always shows its real span. */
export function span(s: { start_time: string; end_time: string }) {
  return `${timeFmt.format(new Date(s.start_time))}–${timeFmt.format(new Date(s.end_time))}`;
}

export function runtime(min: number, hLabel = "h", mLabel = "min") {
  return `${Math.floor(min / 60)} ${hLabel} ${min % 60} ${mLabel}`;
}

export function price(value: string) {
  return `${Math.round(Number(value)).toLocaleString("ru-RU")} ₸`;
}

export type Day = { iso: string; weekday: string; date: string; isToday: boolean };

/** Today and the next 6 days, in Almaty time. */
export function nextDays(count = 7, locale = "en-GB", todayLabel = "Today"): Day[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return {
      iso: isoFmt.format(d),
      weekday: i === 0 ? todayLabel : formatWeekday(d, locale),
      date: formatShortDate(d, locale),
      isToday: i === 0,
    };
  });
}

export function dayOf(iso: string) {
  return isoFmt.format(new Date(iso));
}

/** Current YYYY-MM-DD date in Almaty time. */
export function almatyToday() {
  return isoFmt.format(new Date());
}

/** Combine local YYYY-MM-DD and HH:MM into an Almaty (+05:00) ISO-8601 timestamp. */
export function almatyIso(dateStr: string, timeStr: string) {
  return `${dateStr}T${timeStr}:00+05:00`;
}
