import { z } from "zod";
import { normalizeText } from "@/modules/institutions/labels";
import type { RowError } from "@/modules/institutions/import-parse";

// Columna -> campo. Pensado para las hojas que genera Meta Lead Ads (en español o inglés).
export const LEAD_COLUMNS = {
  lead_id: { field: "external_id", aliases: ["id", "id del lead", "id lead"] },
  nombre: { field: "full_name", aliases: ["nombre completo", "full name", "name"] },
  correo: { field: "email", aliases: ["email", "correo electronico", "e mail"] },
  telefono: { field: "phone", aliases: ["tel", "celular", "whatsapp", "phone", "phone number"] },
  ciudad: { field: "city", aliases: ["city", "municipio"] },
  estado: { field: "region", aliases: ["state", "region", "provincia"] },
  pais: { field: "country", aliases: ["country"] },
  quien_llena: { field: "respondent", aliases: ["quien llena el formulario", "parentesco"] },
  edad: { field: "age_range", aliases: ["age", "rango de edad"] },
  grado: { field: "grade", aliases: ["grado escolar", "grade", "nivel"] },
  fecha: { field: "date", aliases: ["created time", "fecha de registro"] },
  hora: { field: "time", aliases: [] },
  notas: { field: "notes", aliases: ["comentarios", "seguimiento", "observaciones"] },
} as const;

// Meta exporta las respuestas de opción como "__⁠padre/madre/tutor___⁠" o "3ro_de_preparatoria_12th_grade_(_)".
export function cleanAnswer(v: string): string {
  let t = v.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/_/g, " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim();
  if ((t.match(/\(/g)?.length ?? 0) > (t.match(/\)/g)?.length ?? 0)) t += ")";
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).transform((v) => v || null);
const answer = (max: number) => z.string().transform(cleanAnswer).pipe(z.string().max(max)).transform((v) => v || null);

export const leadRowSchema = z.object({
  external_id: z.string().trim().max(100).regex(/^[\w.-]*$/, "Lead ID no válido (si se ve como 1.99E+15, formatea la columna como texto)")
    .transform((v) => v || null),
  full_name: z.string().trim().min(1, "Falta el nombre").max(200),
  email: z.string().trim().toLowerCase().pipe(z.union([z.literal(""), z.email("Correo no válido")])).transform((v) => v || null),
  phone: z.string().trim().max(40).transform((v) => v.replace(/^p:/, "").trim() || null),
  city: text(120),
  region: text(120),
  country: text(120),
  respondent: answer(120),
  age_range: answer(60),
  grade: answer(120),
  // "2026-07-21" o "21/07/2026"; Meta también manda "2026-07-21T19:45:00-06:00".
  date: z.string().trim().transform((v, ctx) => {
    if (!v) return null;
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
    const d = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0];
    if (!d || Number.isNaN(Date.parse(d))) { ctx.addIssue({ code: "custom", message: "Fecha no válida: usa AAAA-MM-DD o DD/MM/AAAA" }); return z.NEVER; }
    return d;
  }),
  time: z.string().trim().transform((v) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v);
    return m && +m[1] < 24 ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  }),
  notes: text(4000),
}).refine((r) => r.email || r.phone, { message: "Falta el correo o el teléfono", path: ["email"] });

export type LeadRow = z.infer<typeof leadRowSchema> & { row: number };

export function parseLeadRows(rows: string[][]) {
  const [header = [], ...data] = rows;
  const lookup = new Map<string, string>();
  for (const [col, { field, aliases }] of Object.entries(LEAD_COLUMNS)) {
    for (const n of [col, ...aliases]) lookup.set(normalizeText(n), field);
  }
  const fields: (string | null)[] = header.map((h) => lookup.get(normalizeText(h)) ?? null);
  // Columna sin encabezado al final: en estas hojas es donde el equipo anota el seguimiento.
  const blank = header.findIndex((h) => !h.trim());
  if (blank >= 0 && !fields.includes("notes")) fields[blank] = "notes";
  const unknownColumns = header.filter((h, i) => h.trim() && !fields[i]);
  const valid: LeadRow[] = [];
  const errors: RowError[] = [];
  data.forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => !c?.trim())) return;
    const raw: Record<string, string> = {};
    for (const f of Object.values(LEAD_COLUMNS)) raw[f.field] = "";
    fields.forEach((f, c) => { if (f) raw[f] = String(cells[c] ?? ""); });
    const parsed = leadRowSchema.safeParse(raw);
    if (parsed.success) valid.push({ ...parsed.data, row });
    else for (const issue of parsed.error.issues) errors.push({ row, field: String(issue.path[0]), message: issue.message });
  });
  return { valid, errors, unknownColumns };
}
