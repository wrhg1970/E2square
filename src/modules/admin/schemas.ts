import { z } from "zod";
import { CURRENCIES } from "@/modules/catalog/labels";

const name = z.string().trim().min(2, "El nombre es muy corto").max(200);
const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Usa el código de país de 2 letras (MX, CO, US…)");
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? null : v), schema.nullable());

export const companySchema = z.object({
  legal_name: name,
  tax_id: optional(z.string().trim().max(50)),
  country_code: countryCode,
});

export const businessUnitSchema = z.object({
  name,
  company_id: z.uuid("Elige una empresa"),
});

export const officeSchema = z.object({
  name,
  company_id: z.uuid("Elige una empresa"),
  business_unit_id: optional(z.uuid()),
  country_code: countryCode,
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Zona horaria no válida"),
});

export const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Correo no válido")),
  role_id: z.uuid("Elige un rol"),
});

export const exchangeRateSchema = z
  .object({
    base_currency: z.enum(CURRENCIES, "Elige la moneda base"),
    quote_currency: z.enum(CURRENCIES, "Elige la moneda destino"),
    rate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
    effective_at: z.iso.date("Fecha no válida"),
  })
  .refine((r) => r.base_currency !== r.quote_currency, "Elige dos monedas distintas");
