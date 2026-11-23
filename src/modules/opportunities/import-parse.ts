import { z } from "zod";
import { CURRENCIES } from "@/modules/catalog/labels";
import { fromLabel, normalizeText } from "@/modules/institutions/labels";
import type { RowError } from "@/modules/institutions/import-parse";

// Columna de la plantilla -> campo (con variantes comunes del encabezado).
export const OPPORTUNITY_COLUMNS = {
  institucion: { field: "institution", aliases: ["colegio", "cliente", "nombre institucion"] },
  oportunidad: { field: "name", aliases: ["nombre", "nombre oportunidad", "descripcion"] },
  proveedor: { field: "supplier", aliases: [] },
  producto: { field: "product", aliases: [] },
  monto: { field: "amount", aliases: ["importe", "venta", "total", "precio"] },
  costo: { field: "cost", aliases: [] },
  moneda: { field: "currency", aliases: ["divisa"] },
  estado: { field: "status", aliases: ["estatus", "resultado"] },
  fecha_cierre: { field: "close_date", aliases: ["fecha", "fecha de cierre", "cierre"] },
  responsable: { field: "owner", aliases: ["vendedor", "agente", "correo responsable"] },
  motivo_perdida: { field: "loss_reason", aliases: ["motivo", "motivo de perdida"] },
} as const;

export const OPPORTUNITY_TEMPLATE = Object.keys(OPPORTUNITY_COLUMNS);
const statusLabels = { open: "Abierta", won: "Ganada", lost: "Perdida" } as const;

// "$12,500.50" -> 12500.5 (separador de miles con coma, como en México).
const money = z.preprocess((v) => {
  const t = String(v ?? "").replace(/[$\s]/g, "").replace(/,/g, "");
  return t === "" ? undefined : Number(t);
}, z.number("Monto no válido").min(0, "El monto no puede ser negativo"));

// "30/06/2025" o "2025-06-30" -> "2025-06-30".
const day = z.preprocess((v) => {
  const t = String(v ?? "").trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return t === "" ? undefined : dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : t;
}, z.iso.date("Fecha no válida: usa AAAA-MM-DD o DD/MM/AAAA").optional());

export const opportunityRowSchema = z.object({
  institution: z.string().trim().min(1, "Falta la institución"),
  name: z.string().trim().max(200).optional().default(""),
  supplier: z.string().trim().min(1, "Falta el proveedor"),
  product: z.string().trim().optional().default(""),
  amount: money,
  cost: money.optional(),
  currency: z.preprocess((v) => (String(v ?? "").trim() === "" ? "MXN" : String(v).trim().toUpperCase()),
    z.enum(CURRENCIES, `Moneda no válida. Usa: ${CURRENCIES.join(", ")}`)),
  status: z.preprocess((v) => fromLabel(statusLabels, String(v ?? "")), z.enum(["open", "won", "lost"], "Estado: usa Abierta, Ganada o Perdida")),
  close_date: day,
  owner: z.string().trim().toLowerCase().optional().default(""),
  loss_reason: z.string().trim().max(500).optional().default(""),
}).refine((r) => r.status === "open" || r.close_date, { message: "Las ganadas y perdidas necesitan fecha de cierre", path: ["close_date"] });

export type OpportunityRow = z.infer<typeof opportunityRowSchema> & { row: number };

export function parseOpportunityRows(rows: string[][]) {
  const [header = [], ...data] = rows;
  const lookup = new Map<string, string>();
  for (const [col, { field, aliases }] of Object.entries(OPPORTUNITY_COLUMNS)) {
    for (const n of [col, ...aliases]) lookup.set(normalizeText(n), field);
  }
  const fields = header.map((h) => lookup.get(normalizeText(h)) ?? null);
  const unknownColumns = header.filter((h, i) => h.trim() && !fields[i]);
  const valid: OpportunityRow[] = [];
  const errors: RowError[] = [];
  data.forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => !c?.trim())) return;
    const raw: Record<string, string> = {};
    fields.forEach((f, c) => { if (f) raw[f] = (cells[c] ?? "").trim(); });
    const parsed = opportunityRowSchema.safeParse(raw);
    if (parsed.success) valid.push({ ...parsed.data, row });
    else for (const issue of parsed.error.issues) errors.push({ row, field: String(issue.path[0]), message: issue.message });
  });
  return { valid, errors, unknownColumns };
}
