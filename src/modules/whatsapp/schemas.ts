import { z } from "zod";

export const whatsappAccountSchema = z.object({
  phone_number_id: z.string().trim().regex(/^[0-9]{5,30}$/, "El Phone number ID son solo dígitos (Meta › WhatsApp › API Setup)."),
  display_phone: z.string().trim().min(8, "Escribe el número como lo verán tus contactos, p. ej. +52 55 1234 5678").max(30),
  app_secret: z.string().trim().regex(/^[0-9a-f]{16,64}$/i, "El App Secret está en Meta › App settings › Basic; son letras a-f y números."),
});
