// Periodos de metas con fechas "YYYY-MM-DD" (sin zona: son días calendario).
export const periodKinds = { custom: "Fechas a mano", month: "Mes", quarter: "Trimestre", year: "Año" } as const;
export type PeriodKind = keyof typeof periodKinds;

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parts = (day: string) => day.split("-").map(Number) as [number, number, number];

// Mes, trimestre o año calendario que contiene "day".
export function periodRange(kind: Exclude<PeriodKind, "custom">, day: string) {
  const [y, m] = parts(day);
  const first = kind === "year" ? 0 : kind === "quarter" ? Math.floor((m - 1) / 3) * 3 : m - 1;
  const months = kind === "year" ? 12 : kind === "quarter" ? 3 : 1;
  return { start: iso(y, first, 1), end: iso(y, first + months, 0) };
}

// Siguiente periodo: si son meses completos se corre por meses; si no, por el mismo número de días.
export function nextPeriod(start: string, end: string) {
  const [ys, ms, ds] = parts(start);
  const [ye, me, de] = parts(end);
  if (ds === 1 && iso(ye, me, 0) === end) {
    const months = (ye - ys) * 12 + (me - ms) + 1;
    return { start: iso(ys, ms - 1 + months, 1), end: iso(ye, me + months, 0) };
  }
  const days = (Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86_400_000 + 1;
  return { start: iso(ye, me - 1, de + 1), end: iso(ye, me - 1, de + days) };
}

// % del periodo transcurrido a "today" (incluye el día de hoy); null si aún no empieza o ya terminó.
export function expectedPct(start: string, end: string, today: string) {
  if (today < start || today > end) return null;
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return Math.round(((day(today) - day(start) + 1) / (day(end) - day(start) + 1)) * 100);
}

// Mismo tramo "n" meses antes (recorta el día al fin de mes): 2026-11-01..24 → 2026-10-01..24.
export function shiftMonths(day: string, n: number) {
  const [y, m, d] = parts(day);
  return iso(y, m - 1 - n, Math.min(d, Number(iso(y, m - n, 0).slice(8))));
}
