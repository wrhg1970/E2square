import { z } from "zod";
import { decisionRoles, institutionStatuses, institutionTypes, potentials } from "./labels";

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(empty, s.nullable().optional());
const text = (max = 200) => opt(z.string().trim().max(max));
const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const institutionSchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto").max(200),
  legal_name: text(),
  institution_type: z.enum(keys(institutionTypes), "Elige un tipo"),
  subtype: text(100),
  country_code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Usa el código de país de 2 letras (MX, CO, US…)"),
  region: text(100),
  city: text(100),
  address: text(300),
  website: text(300),
  phone: text(50),
  email: opt(z.string().trim().toLowerCase().pipe(z.email("Correo no válido"))),
  tax_id: text(50),
  estimated_size: opt(z.coerce.number().int("Usa un número entero").min(0)),
  status: z.enum(keys(institutionStatuses)).default("prospect"),
  potential: opt(z.enum(keys(potentials))),
  source: text(100),
  notes: text(5000),
  office_id: opt(z.uuid()),
  owner_id: opt(z.uuid()),
  parent_institution_id: opt(z.uuid()),
});

export const contactSchema = z.object({
  first_name: z.string().trim().min(1, "Escribe el nombre").max(100),
  last_name: z.string().trim().max(100).default(""),
  email: opt(z.string().trim().toLowerCase().pipe(z.email("Correo no válido"))),
  phone: text(50),
  job_title: text(100),
  department: text(100),
  decision_role: opt(z.enum(keys(decisionRoles))),
  is_primary: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export const branchSchema = z.object({
  name: z.string().trim().min(2, "El nombre es muy corto").max(200),
  city: text(100),
  address: text(300),
});

// Texto de búsqueda seguro para filtros de PostgREST: sin comas, paréntesis ni comodines.
export const searchTerm = (q: unknown) => (typeof q === "string" ? q.replace(/[,()%*\\]/g, " ").trim().slice(0, 100) : "");
