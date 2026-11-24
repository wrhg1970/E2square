import { z } from "zod";
import { currency } from "@/modules/catalog/schemas";
import { activityTypes } from "@/modules/activities/labels";
import { institutionStatuses, institutionTypes } from "@/modules/institutions/labels";

export const campaignTypes = {
  email: "Correo", whatsapp: "WhatsApp", call: "Llamadas", event: "Evento", fair: "Feria", visit: "Visitas", other: "Otra",
} as const;
export const campaignStatuses = { draft: "Borrador", active: "Activa", finished: "Terminada", cancelled: "Cancelada" } as const;
export const campaignTone: Record<string, "slate" | "teal" | "sky" | "red"> = { draft: "slate", active: "teal", finished: "sky", cancelled: "red" };

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(empty, s.nullable().optional());
const money = z.coerce.number("Usa un número").min(0, "No puede ser negativo").max(1e12);
const leadGoal = opt(z.coerce.number("Usa un número").int("Usa un número entero").min(1, "La meta debe ser al menos 1").max(1_000_000));
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const campaignSchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto").max(200),
  campaign_type: z.enum(keys(campaignTypes), "Elige un tipo"),
  product_id: opt(z.uuid()),
  start_date: z.iso.date("Fecha de inicio no válida"),
  end_date: opt(z.iso.date("Fecha de fin no válida")),
  currency_code: currency,
  budget_amount: money.default(0),
  lead_goal: leadGoal,
  notes: opt(z.string().trim().max(5000)),
}).refine((d) => !d.end_date || d.end_date >= d.start_date, { message: "El fin no puede ser antes del inicio", path: ["end_date"] });

export const costSchema = z.object({ actual_cost: money, lead_goal: leadGoal });

export const segmentSchema = z.object({
  country: opt(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "País con 2 letras (MX, CO…)")),
  types: z.array(z.enum(keys(institutionTypes))).default([]),
  owner: opt(z.uuid()),
  status: opt(z.enum(keys(institutionStatuses))),
});

export const stepSchema = z.object({
  day_offset: z.coerce.number("Usa un número de días").int("Días enteros").min(0, "Desde el día 0").max(365, "Máximo 365 días"),
  activity_type: z.enum(keys(activityTypes), "Elige un tipo"),
  subject: z.string().trim().min(2, "Describe el paso").max(150),
});

export type CampaignResults = {
  members: number; with_consent: number; responded: number; meetings: number; tasks_pending: number;
  opportunities: number; leads: number; lead_goal: number | null; open_amount: number; won_count: number; won_amount: number; won_margin: number;
  unconverted: number; cost: number; roi_pct: number | null;
};
