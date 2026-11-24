import { z } from "zod";

// Menú fijo de consultas: la IA solo puede elegir de aquí (nunca escribe SQL).
export const queryMetrics = {
  won_amount: "Venta ganada", won_margin: "Margen ganado", won_units: "Unidades vendidas",
  won_count: "Ventas ganadas (número)", lost_count: "Oportunidades perdidas (número)", open_amount: "Pipeline abierto (por cierre estimado)",
} as const;
export const queryGroups = {
  total: "Total", month: "Mes", supplier: "Proveedor", owner: "Vendedor", stage: "Etapa", company: "Empresa",
} as const;
export const moneyQueryMetrics = ["won_amount", "won_margin", "open_amount"] as const;

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const querySpec = z.object({
  metric: z.enum(keys(queryMetrics), "Elige qué medir"),
  group: z.enum(keys(queryGroups), "Elige cómo agrupar"),
  from: z.iso.date("Fecha inicial no válida"),
  to: z.iso.date("Fecha final no válida"),
}).refine((q) => q.to >= q.from, { message: "La fecha final debe ser posterior a la inicial", path: ["to"] });
export type QuerySpec = z.infer<typeof querySpec>;

export const ASK_SYSTEM = `Traduces preguntas de un CRM de ventas educativas a una consulta JSON. Responde SOLO con un objeto JSON, sin texto extra:
{"metric": <${Object.keys(queryMetrics).join(" | ")}>, "group": <${Object.keys(queryGroups).join(" | ")}>, "from": "AAAA-MM-DD", "to": "AAAA-MM-DD"}
Significados: ${Object.entries(queryMetrics).map(([k, v]) => `${k} = ${v}`).join("; ")}. Agrupaciones: ${Object.entries(queryGroups).map(([k, v]) => `${k} = ${v}`).join("; ")}.
Si la pregunta no da fechas, usa el año en curso hasta hoy. Si no se puede responder con estas opciones, responde {"error": "<explicación breve en español>"}.`;

// Extrae y valida el JSON que devuelve la IA (puede venir dentro de un bloque de código).
export function parseAiSpec(text: string): QuerySpec | { error: string } {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { error: "No entendí la pregunta. Usa el formulario de abajo." };
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { error: "No entendí la pregunta. Usa el formulario de abajo." }; }
  if (raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string") return { error: raw.error.slice(0, 300) };
  const r = querySpec.safeParse(raw);
  return r.success ? r.data : { error: "No pude convertir la pregunta en una consulta válida. Usa el formulario de abajo." };
}
