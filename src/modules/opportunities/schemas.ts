import { z } from "zod";
import { currency } from "@/modules/catalog/schemas";

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(empty, s.nullable().optional());
const money = z.coerce.number("Usa un número").min(0, "No puede ser negativo").max(1e12);

export const opportunitySchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto").max(200),
  institution_id: z.uuid("Elige una institución"),
  pipeline_id: z.uuid("Elige un producto"),
  currency_code: currency,
  expected_close_date: opt(z.iso.date("Fecha no válida")),
  owner_id: opt(z.uuid()),
  primary_contact_id: opt(z.uuid()),
  source: opt(z.string().trim().max(100)),
  source_campaign_id: opt(z.uuid()),
  competitor: opt(z.string().trim().max(100)),
  notes: opt(z.string().trim().max(5000)),
});

export const opportunityUpdateSchema = opportunitySchema.omit({ institution_id: true, pipeline_id: true, currency_code: true, source_campaign_id: true }).extend({
  probability: z.coerce.number().int().min(0, "Probabilidad entre 0 y 100").max(100, "Probabilidad entre 0 y 100"),
});

export const itemSchema = z.object({
  product_id: z.uuid("Elige un producto"),
  price_list_item_id: opt(z.uuid()),
  description: opt(z.string().trim().max(300)),
  quantity: z.coerce.number("Usa un número").positive("La cantidad debe ser mayor a 0").max(1e9),
  unit_price: money,
  discount_pct: z.preprocess(empty, z.coerce.number().min(0).max(100, "Descuento entre 0 y 100").default(0)),
  unit_cost: z.preprocess(empty, money.default(0)),
});

export const stageChangeSchema = z.object({
  stage_id: z.uuid("Elige una etapa"),
  loss_reason: opt(z.string().trim().max(300)),
});
