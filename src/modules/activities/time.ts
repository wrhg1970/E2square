// Fechas: se guardan en UTC y se muestran en la zona del usuario.

// Offset (ms) de una zona IANA en un instante dado.
function offsetAt(utcMs: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

// "2026-11-20T10:30" en America/Mexico_City -> instante UTC.
export function zonedToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("Fecha y hora no válidas");
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = naive - offsetAt(naive, timeZone);
  // Segunda pasada por si el offset cambia en ese intervalo (horario de verano).
  return new Date(naive - offsetAt(first, timeZone));
}

// Instante UTC -> "YYYY-MM-DDTHH:mm" en la zona dada (para inputs datetime-local).
export function utcToLocalInput(iso: string, timeZone: string) {
  const d = new Date(new Date(iso).getTime() + offsetAt(new Date(iso).getTime(), timeZone));
  return d.toISOString().slice(0, 16);
}

// Día calendario guardado como YYYY-MM-DD (sin hora) -> "12 ene 2027". Se fija a UTC para no recorrer el día.
export const formatDay = (day: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${day.slice(0, 10)}T12:00:00Z`));

export const formatDateTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Día calendario (YYYY-MM-DD) de un instante en una zona.
export const dayIn = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

// Aritmética de días calendario (YYYY-MM-DD), sin zona: se usa con días ya calculados con dayIn.
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Lunes de la semana que contiene ese día.
export const weekStart = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

// Vistas del calendario: días que se muestran (la de mes rellena hasta semanas completas, de lunes a domingo).
export const calendarViews = { dia: "Día", semana: "Semana", mes: "Mes" } as const;
export type CalendarView = keyof typeof calendarViews;

export function calendarDays(view: CalendarView, day: string) {
  if (view === "dia") return [day];
  if (view === "semana") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
  const first = `${day.slice(0, 7)}-01`;
  const last = addDays(new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7), 1)).toISOString().slice(0, 10), -1);
  const days = [];
  for (let d = weekStart(first); d <= last || days.length % 7; d = addDays(d, 1)) days.push(d);
  return days;
}

// Día equivalente en el periodo anterior (-1) o siguiente (+1). En meses va al día 1.
export function stepCalendar(view: CalendarView, day: string, n: number) {
  if (view !== "mes") return addDays(day, n * (view === "dia" ? 1 : 7));
  return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 10);
}
