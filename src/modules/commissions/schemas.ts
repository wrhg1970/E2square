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
