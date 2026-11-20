import { z } from "zod";
import { CURRENCIES } from "@/modules/catalog/labels";
import { goalMetrics, moneyMetrics } from "./labels";

const optionalId = z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable());

export const goalSchema = z
  .object({
    name: z.string().trim().min(2, "Ponle nombre a la meta").max(120),
    metric: z.enum(Object.keys(goalMetrics) as [keyof typeof goalMetrics], "Elige qué se mide"),
    period_start: z.iso.date("Fecha de inicio no válida"),
    period_end: z.iso.date("Fecha de fin no válida"),
    target: z.coerce.number().positive("El objetivo debe ser mayor a 0"),
    currency_code: z.preprocess((v) => (v === "" ? null : v), z.enum(CURRENCIES).nullable()),
    owner_id: optionalId,
    office_id: optionalId,
    product_id: optionalId,
  })
  .refine((g) => g.period_end >= g.period_start, { message: "El fin debe ser posterior al inicio", path: ["period_end"] })
  .transform((g) => ({
    ...g,
    // La moneda solo aplica a metas de dinero (la base lo exige).
    currency_code: (moneyMetrics as readonly string[]).includes(g.metric) ? g.currency_code : null,
  }))
  .refine((g) => !(moneyMetrics as readonly string[]).includes(g.metric) || g.currency_code, {
    message: "Elige la moneda de la meta",
    path: ["currency_code"],
  });
