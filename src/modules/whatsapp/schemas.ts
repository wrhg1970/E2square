import { z } from "zod";

export const whatsappAccountSchema = z.object({
  phone_number_id: z.string().trim().regex(/^[0-9]{5,30}$/, "El Phone number ID son solo dígitos (Meta › WhatsApp › API Setup)."),
  display_phone: z.string().trim().min(8, "Escribe el número como lo verán tus contactos, p. ej. +52 55 1234 5678").max(30),
  app_secret: z.string().trim().regex(/^[0-9a-f]{16,64}$/i, "El App Secret está en Meta › App settings › Basic; son letras a-f y números."),
});

const uuid = z.uuid("Elige una opción válida.");

export const sendSchema = z.object({
  contact_id: uuid,
  template_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullable()),
  text: z.string().trim().max(4096, "Máximo 4096 caracteres.").default(""),
}).refine((d) => d.template_id || d.text, { message: "Elige una plantilla o escribe el mensaje.", path: ["text"] });

export const templateSchema = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]{1,200}$/, "Usa el nombre exacto de Meta: minúsculas, números y guion bajo."),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Idioma como en Meta, p. ej. es_MX.").default("es_MX"),
  body_preview: z.string().trim().min(1, "Copia el texto de la plantilla.").max(1024),
  uses_first_name: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

export const consentSchema = z.object({
  consent_status: z.enum(["granted", "revoked"]),
  consent_source: z.string().trim().min(3, "Anota cómo lo autorizó (p. ej. formulario de feria).").max(200),
});

type Prepared = { phone_number_id: string; to: string; text: string | null; template: { name: string; language: string; first_name: string | null } | null };

// Cuerpo para POST /{phone_number_id}/messages de la Cloud API.
export function graphPayload(p: Prepared) {
  if (p.template) {
    return {
      messaging_product: "whatsapp", to: p.to, type: "template",
      template: {
        name: p.template.name, language: { code: p.template.language },
        ...(p.template.first_name ? { components: [{ type: "body", parameters: [{ type: "text", text: p.template.first_name }] }] } : {}),
      },
    };
  }
  return { messaging_product: "whatsapp", to: p.to, type: "text", text: { body: p.text ?? "", preview_url: false } };
}
