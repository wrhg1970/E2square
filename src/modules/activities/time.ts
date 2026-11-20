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

export const formatDateTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Día calendario (YYYY-MM-DD) de un instante en una zona.
export const dayIn = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
