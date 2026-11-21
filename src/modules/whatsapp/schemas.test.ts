import { describe, expect, it } from "vitest";
import { graphPayload, sendSchema, whatsappAccountSchema } from "./schemas";

describe("configuración de WhatsApp", () => {
  it("acepta los datos de Meta y rechaza valores mal copiados", () => {
    expect(whatsappAccountSchema.safeParse({ phone_number_id: "106540352242922", display_phone: "+52 55 1234 5678", app_secret: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }).success).toBe(true);
    expect(whatsappAccountSchema.safeParse({ phone_number_id: "+52 55", display_phone: "+52 55 1234 5678", app_secret: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }).success).toBe(false);
    expect(whatsappAccountSchema.safeParse({ phone_number_id: "106540352242922", display_phone: "+52 55 1234 5678", app_secret: "EAAG-token-de-acceso" }).success).toBe(false);
  });
});


describe("envío de WhatsApp", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("exige plantilla o texto", () => {
    expect(sendSchema.safeParse({ contact_id: id, template_id: "", text: "  " }).success).toBe(false);
    expect(sendSchema.safeParse({ contact_id: id, template_id: "", text: "Hola" }).success).toBe(true);
    expect(sendSchema.safeParse({ contact_id: id, template_id: id, text: "" }).success).toBe(true);
  });
  it("arma el cuerpo de la Cloud API", () => {
    expect(graphPayload({ phone_number_id: "1", to: "5215512345678", text: "Hola", template: null }))
      .toEqual({ messaging_product: "whatsapp", to: "5215512345678", type: "text", text: { body: "Hola", preview_url: false } });
    expect(graphPayload({ phone_number_id: "1", to: "52", text: null, template: { name: "seguimiento", language: "es_MX", first_name: "Ana" } }).template)
      .toEqual({ name: "seguimiento", language: { code: "es_MX" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }] }] });
  });
});
