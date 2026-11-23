import { z } from "zod";
import { commissionBases } from "./labels";

export const rateSchema = z.object({
  profile_id: z.uuid("Elige el agente"),
  product_id: z.uuid("Elige el producto"),
  rate_pct: z.coerce.number("Indica el porcentaje").gt(0, "El porcentaje debe ser mayor a 0").max(100, "El porcentaje no puede pasar de 100"),
  basis: z.enum(Object.keys(commissionBases) as [keyof typeof commissionBases], "Elige si se calcula sobre venta o margen"),
});

export const decisionSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["approved", "rejected", "paid"]),
    note: z.string().trim().max(500).optional().default(""),
  })
  .refine((d) => d.status !== "rejected" || d.note.length > 0, { message: "Indica el motivo del rechazo", path: ["note"] });

// "100:1, 120:2" -> [{min_pct: 100, extra_pct: 1}, ...]: % de la meta alcanzado y puntos extra de comisión.
export function parseTiers(text: string) {
  const parts = text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
  const tiers = parts.map((p) => /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(p));
  if (tiers.some((m) => !m)) return null;
  const out = tiers.map((m) => ({ min_pct: Number(m![1]), extra_pct: Number(m![2]) }));
  if (out.some((t) => t.min_pct <= 0 || t.min_pct > 1000 || t.extra_pct <= 0 || t.extra_pct > 100)) return null;
  return out.sort((a, b) => a.min_pct - b.min_pct);
}

export const formatTiers = (tiers: { min_pct: number; extra_pct: number }[]) => tiers.map((t) => `${t.min_pct}:${t.extra_pct}`).join(", ");

export const settingsSchema = z.object({
  new_institution_bonus: z.coerce.number("Indica el bono").min(0, "El bono no puede ser negativo").max(1_000_000, "Bono demasiado alto"),
  bonus_currency: z.string().regex(/^[A-Z]{3}$/, "Elige la moneda"),
  require_collection: z.literal("on").optional().transform((v) => v === "on"),
  tiers: z.string().trim().max(500).transform((t, ctx) => {
    const parsed = parseTiers(t);
    if (!parsed) ctx.addIssue({ code: "custom", message: "Escribe los escalones como 100:1, 120:2 (% de la meta : % extra)" });
    return parsed ?? [];
  }),
});

export const splitSchema = z.object({
  opportunity_id: z.uuid(),
  profile_id: z.uuid("Elige el agente"),
  share_pct: z.coerce.number("Indica el porcentaje").gt(0, "El porcentaje debe ser mayor a 0").lt(100, "Debe ser menor a 100"),
});
