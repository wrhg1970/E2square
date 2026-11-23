import { dayIn, zonedToUtc } from "@/modules/activities/time";

// Mes "YYYY-MM" (por defecto el actual en la zona del usuario) -> rango [desde, hasta) en UTC.
export function monthRange(mes: unknown, timeZone: string, now = new Date()) {
  const valid = typeof mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const month = valid ? (mes as string) : dayIn(now, timeZone).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { month, from: zonedToUtc(`${month}-01T00:00`, timeZone).toISOString(), to: zonedToUtc(`${next}-01T00:00`, timeZone).toISOString() };
}
