import type { PillTone } from "@/components/ui/pill";

export const leadStatuses = {
  new: "Nuevo",
  contacting: "En contacto",
  qualified: "Interesado",
  converted: "Convertido",
  discarded: "Descartado",
} as const;
export type LeadStatus = keyof typeof leadStatuses;

export const leadStatusTone: Record<LeadStatus, PillTone> = {
  new: "sky", contacting: "amber", qualified: "violet", converted: "teal", discarded: "slate",
};

export const leadSources = { meta: "Meta", web: "Sitio web", referral: "Recomendación", event: "Evento", other: "Otro" } as const;

// "hace 5 min", "hace 3 h", "ayer", "hace 4 días"; después de una semana, la fecha corta.
export function receivedAgo(iso: string, now = new Date()): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
  const days = Math.floor(min / (24 * 60));
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" });
}

// Teléfono a dígitos con lada de país para tel: y wa.me. Con 10 dígitos sin lada se usa el país del
// prospecto: Estados Unidos (1) o, si no, México (52).
export function phoneDigits(phone: string, country?: string | null): string {
  const d = phone.replace(/\D/g, "");
  if (d.length !== 10) return d;
  return /^(us|usa|eua|ee\.? ?uu\.?|estados unidos|united states)/i.test(country?.trim() ?? "") ? `1${d}` : `52${d}`;
}
