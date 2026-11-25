import { z } from "zod";
import { activityTypes, priorities } from "./labels";

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(empty, s.nullable().optional());
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora no válidas");

export const activitySchema = z.object({
  activity_type: z.enum(Object.keys(activityTypes) as [keyof typeof activityTypes], "Elige un tipo"),
  subject: z.string().trim().min(2, "Escribe el asunto").max(200),
  due_local: opt(localDateTime),
  reminder: opt(z.enum(["0", "15", "60", "1440"], "Elige un recordatorio válido")),
  priority: z.enum(Object.keys(priorities) as [keyof typeof priorities]).default("normal"),
  institution_id: opt(z.uuid()),
  opportunity_id: opt(z.uuid()),
  contact_id: opt(z.uuid()),
  // Responsable; vacío = quien la crea.
  owner_id: opt(z.uuid("Elige un responsable válido")),
  notes: opt(z.string().trim().max(5000)),
  done: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  outcome: opt(z.string().trim().max(500)),
});

export const completeSchema = z.object({
  outcome: opt(z.string().trim().max(500)),
  next_subject: opt(z.string().trim().min(2, "El asunto de la siguiente actividad es muy corto").max(200)),
  next_type: opt(z.enum(Object.keys(activityTypes) as [keyof typeof activityTypes])),
  next_due_local: opt(localDateTime),
});
