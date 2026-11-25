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
