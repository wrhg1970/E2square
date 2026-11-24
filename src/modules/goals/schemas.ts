import { z } from "zod";
import { CURRENCIES } from "@/modules/catalog/labels";
import { goalMetrics, moneyMetrics } from "./labels";
import { periodRange } from "./period";

const optionalId = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.uuid().nullable());

// Con un periodo predefinido (mes, trimestre, año) las fechas salen de "Desde"; si no, se capturan las dos.
const withPeriod = (v: unknown) => {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const kind = o.period_kind;
  if (kind === "month" || kind === "quarter" || kind === "year") {
    if (typeof o.period_start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.period_start)) return o;
    const r = periodRange(kind, o.period_start);
    return { ...o, period_start: r.start, period_end: r.end };
  }
  return o;
};

export const goalSchema = z.preprocess(withPeriod, z
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
    company_id: optionalId,
    business_unit_id: optionalId,
    team_id: optionalId,
  })
  .refine((g) => !(g.team_id && g.owner_id), { message: "Elige un vendedor o un equipo, no ambos", path: ["team_id"] })
  .refine((g) => g.period_end >= g.period_start, { message: "El fin debe ser posterior al inicio", path: ["period_end"] })
  .transform((g) => ({
    ...g,
    // La moneda solo aplica a metas de dinero (la base lo exige).
    currency_code: (moneyMetrics as readonly string[]).includes(g.metric) ? g.currency_code : null,
  }))
  .refine((g) => !(moneyMetrics as readonly string[]).includes(g.metric) || g.currency_code, {
    message: "Elige la moneda de la meta",
    path: ["currency_code"],
  }));

// Reparto: vendedores marcados y, opcionalmente, el objetivo de cada uno ("target_<id>"). Sin montos = partes iguales.
export function parseSplit(owners: string[], targetOf: (id: string) => string | null) {
  const ids = z.array(z.uuid()).safeParse(owners);
  if (!ids.success || new Set(owners).size < 2) return { error: "Elige al menos dos vendedores." } as const;
  const raw = owners.map((id) => (targetOf(id) ?? "").trim());
  if (raw.every((t) => t === "")) return { owners, targets: null } as const;
  const targets = raw.map(Number);
  if (raw.some((t) => t === "") || targets.some((t) => !Number.isFinite(t) || t <= 0)) {
    return { error: "Captura el objetivo de cada vendedor elegido (mayor a 0) o deja todos vacíos para partes iguales." } as const;
  }
  return { owners, targets } as const;
}
