import { decisionRoles, fromLabel, institutionStatuses, institutionTypes, normalizeText, potentials } from "./labels";
import { contactSchema, institutionSchema } from "./schemas";

// Columna de la plantilla -> campo. Se aceptan variantes comunes del encabezado.
export const COLUMNS = {
  nombre: { field: "name", aliases: ["nombre comercial", "institucion"] },
  nombre_legal: { field: "legal_name", aliases: ["razon social"] },
  tipo: { field: "institution_type", aliases: [] },
  pais: { field: "country_code", aliases: ["codigo pais"] },
  estado: { field: "region", aliases: ["region", "provincia", "departamento"] },
  ciudad: { field: "city", aliases: ["municipio"] },
  direccion: { field: "address", aliases: ["domicilio"] },
  sitio_web: { field: "website", aliases: ["web", "pagina web", "sitio"] },
  telefono: { field: "phone", aliases: ["tel"] },
  correo: { field: "email", aliases: ["email", "correo electronico"] },
  id_fiscal: { field: "tax_id", aliases: ["rfc", "nit", "rut", "cuit"] },
  tamano: { field: "estimated_size", aliases: ["alumnos", "empleados", "numero de alumnos"] },
  fuente: { field: "source", aliases: ["origen"] },
  estatus: { field: "status", aliases: ["situacion"] },
  potencial: { field: "potential", aliases: [] },
  contacto_nombre: { field: "contact.first_name", aliases: [] },
  contacto_apellido: { field: "contact.last_name", aliases: ["contacto apellidos"] },
  contacto_correo: { field: "contact.email", aliases: ["contacto email"] },
  contacto_telefono: { field: "contact.phone", aliases: [] },
  contacto_cargo: { field: "contact.job_title", aliases: ["cargo", "puesto"] },
  contacto_rol: { field: "contact.decision_role", aliases: ["rol de decision"] },
} as const;

export const TEMPLATE_HEADERS = Object.keys(COLUMNS);

export type RowError = { row: number; field: string; message: string };
export type ParsedRow = {
  row: number;
  institution: ReturnType<typeof institutionSchema.parse>;
  contact: ReturnType<typeof contactSchema.parse> | null;
};

// Mapea cada encabezado del archivo a un campo; los no reconocidos se ignoran.
export function mapHeaders(headers: string[]): { fields: (string | null)[]; unknown: string[] } {
  const lookup = new Map<string, string>();
  for (const [col, { field, aliases }] of Object.entries(COLUMNS)) {
    for (const name of [col, ...aliases]) lookup.set(normalizeText(name), field);
  }
  const fields = headers.map((h) => lookup.get(normalizeText(h)) ?? null);
  return { fields, unknown: headers.filter((h, i) => h.trim() && !fields[i]) };
}

const ENUMS: Record<string, Record<string, string>> = {
  institution_type: institutionTypes,
  status: institutionStatuses,
  potential: potentials,
  "contact.decision_role": decisionRoles,
};

const HINTS: Record<string, string> = {
  institution_type: `Usa: ${Object.values(institutionTypes).join(", ")}`,
  status: `Usa: ${Object.values(institutionStatuses).join(", ")}`,
  potential: "Usa: Alto, Medio o Bajo",
  "contact.decision_role": `Usa: ${Object.values(decisionRoles).join(", ")}`,
};

// Valida filas (la fila 1 es el encabezado, así que los datos empiezan en la 2).
export function parseRows(rows: string[][]): { valid: ParsedRow[]; errors: RowError[]; unknownColumns: string[] } {
  const [header = [], ...data] = rows;
  const { fields, unknown } = mapHeaders(header);
  const valid: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();

  data.forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => !c?.trim())) return;
    const inst: Record<string, string> = {};
    const contact: Record<string, string> = {};
    fields.forEach((field, c) => {
      if (!field) return;
      let value = (cells[c] ?? "").trim();
      if (value && ENUMS[field]) value = String(fromLabel(ENUMS[field], value) ?? `¿${value}?`);
      if (field.startsWith("contact.")) contact[field.slice(8)] = value;
      else inst[field] = value;
    });

    const rowErrors: RowError[] = [];
    const parsedInst = institutionSchema.safeParse(inst);
    if (!parsedInst.success) {
      for (const issue of parsedInst.error.issues) {
        const field = String(issue.path[0]);
        rowErrors.push({ row, field, message: HINTS[field] ?? issue.message });
      }
    }
    const hasContact = Object.values(contact).some(Boolean);
    const parsedContact = hasContact ? contactSchema.safeParse(contact) : null;
    if (parsedContact && !parsedContact.success) {
      for (const issue of parsedContact.error.issues) {
        const field = `contact.${String(issue.path[0])}`;
        rowErrors.push({ row, field, message: HINTS[field] ?? issue.message });
      }
    }

    const key = parsedInst.success ? normalizeText(parsedInst.data.name) + "|" + (parsedInst.data.city ?? "") : "";
    if (key && seen.has(key)) rowErrors.push({ row, field: "name", message: `Repetida en el archivo (fila ${seen.get(key)})` });
    else if (key) seen.set(key, row);

    if (rowErrors.length) errors.push(...rowErrors);
    else valid.push({ row, institution: parsedInst.data!, contact: parsedContact?.success ? parsedContact.data : null });
  });

  return { valid, errors, unknownColumns: unknown };
}

// CSV mínimo (RFC 4180): comas o punto y coma, comillas dobles y saltos de línea dentro de comillas.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endCell();
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    endCell();
    rows.push(row);
  }
  return rows;
}
