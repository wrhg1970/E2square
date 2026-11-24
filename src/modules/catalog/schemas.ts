import { z } from "zod";
import { CURRENCIES, revenueModels, stageRequirements } from "./labels";

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(empty, z.string().trim().max(max).nullable().optional());
const money = z.coerce.number("Usa un número").min(0, "No puede ser negativo").max(1e12);
const checkbox = z.preprocess((v) => v === "on" || v === true, z.boolean());
export const currency = z.enum(CURRENCIES, "Elige una moneda");

export const productSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, "Clave de 2 a 20 letras o números, sin espacios"),
  name: z.string().trim().min(2, "El nombre es muy corto").max(200),
  description: text(2000),
  category: text(100),
  revenue_model: z.enum(Object.keys(revenueModels) as [keyof typeof revenueModels], "Elige un modelo de ingreso"),
  default_currency: currency,
  active: checkbox.default(true),
  supplier_id: z.preprocess(empty, z.uuid().nullable().optional()),
});

export const priceItemSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(200),
  unit_name: z.string().trim().min(1).max(50).default("alumno"),
  currency_code: currency,
  unit_price: money,
  unit_cost: money.default(0),
  valid_from: z.preprocess(empty, z.iso.date("Fecha no válida").optional()),
});

export const stageSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe el nombre de la etapa").max(100),
    default_probability: z.coerce.number().int().min(0, "Probabilidad entre 0 y 100").max(100, "Probabilidad entre 0 y 100"),
    sla_days: z.preprocess(empty, z.coerce.number().int().positive("Días mayores a 0").nullable().optional()),
    is_won: checkbox,
    is_lost: checkbox,
  })
  .refine((s) => !(s.is_won && s.is_lost), "Una etapa no puede ser ganada y perdida a la vez");

// Los requisitos llegan como varios checkboxes con el mismo nombre.
export const requirementsFrom = (formData: FormData) =>
  formData.getAll("required_fields").map(String).filter((k) => k in stageRequirements);

const email = z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v), z.email("Correo no válido").max(200).nullable().optional());

// Datos generales y dirección del proveedor.
export const supplierProfileSchema = z.object({
  legal_name: text(200),
  tax_id: text(30),
  website: text(300),
  phone: text(40),
  email,
  address: text(300),
  city: text(100),
  state: text(100),
  postal_code: text(20),
  country: text(100),
});

export const supplierContactSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(200),
  job_title: text(120),
  email,
  phone: text(40),
  notes: text(1000),
  is_primary: checkbox,
});

// Logo: imagen ligera (deben coincidir con el bucket "logos"). Sin SVG: puede llevar scripts.
export const LOGO_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export function validateLogo(file: { size: number; type: string }): string | null {
  if (!file.size) return "Elige una imagen.";
  if (file.size > MAX_LOGO_BYTES) return "El logo pesa más de 2 MB.";
  if (!(LOGO_MIME as readonly string[]).includes(file.type)) return "Usa una imagen PNG, JPG o WebP.";
  return null;
}
