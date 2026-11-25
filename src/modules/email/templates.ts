import { z } from "zod";
import type { PillTone } from "@/components/ui/pill";

export const templateCategories = {
  first_contact: "Primer contacto", proposal: "Propuesta", meeting: "Agendamiento", follow_up: "Seguimiento", customer: "Cliente",
} as const;
export type TemplateCategory = keyof typeof templateCategories;
export const categoryTone: Record<TemplateCategory, PillTone> = {
  first_contact: "sky", proposal: "teal", meeting: "violet", follow_up: "amber", customer: "slate",
};

const keys = Object.keys(templateCategories) as [TemplateCategory, ...TemplateCategory[]];
export const templateSchema = z.object({
  category: z.enum(keys, "Elige una categoría"),
  title: z.string().trim().min(2, "El título es muy corto").max(200),
  subject: z.string().trim().min(2, "El asunto es muy corto").max(300),
  body: z.string().trim().min(2, "Escribe el texto del correo").max(20000),
});

export const sendSchema = z.object({
  to: z.email("Correo del destinatario no válido").toLowerCase(),
  subject: z.string().trim().min(1, "Falta el asunto").max(300),
  body: z.string().trim().min(1, "Falta el texto").max(20000),
  institution_id: z.preprocess((v) => v || null, z.uuid().nullable()),
  contact_id: z.preprocess((v) => v || null, z.uuid().nullable()),
  template_id: z.preprocess((v) => v || null, z.uuid().nullable()),
});

// Variables disponibles; las de la derecha son sinónimos que también se aceptan.
export const templateVariables = {
  nombre_institucion: "Nombre de la institución",
  contacto: "Nombre completo del contacto",
  nombre_contacto: "Solo el nombre del contacto",
  cargo_contacto: "Puesto del contacto",
  ciudad: "Ciudad de la institución",
  mi_nombre: "Tu nombre",
} as const;
const aliases: Record<string, keyof typeof templateVariables> = { nombre_colegio: "nombre_institucion", contacto_principal: "contacto" };

export type TemplateValues = Partial<Record<keyof typeof templateVariables, string | null>>;

// Reemplaza {{variable}}; las que no tienen dato se dejan tal cual para que se vean y se llenen a mano.
export function fillTemplate(text: string, values: TemplateValues) {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, raw: string) => {
    const name = raw.toLowerCase();
    const key = (aliases[name] ?? name) as keyof typeof templateVariables;
    const v = values[key]?.trim();
    if (v) return v;
    if (key in templateVariables) missing.add(templateVariables[key]);
    return whole;
  });
  return { text: out, missing: [...missing] };
}

// Enlace que abre la ventana de redactar de Gmail con todo lleno (funciona sin conectar Google).
export function gmailComposeUrl(to: string, subject: string, body: string) {
  return `https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body })}`;
}
