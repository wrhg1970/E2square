import { describe, expect, it } from "vitest";
import { whatsappAccountSchema } from "./schemas";

describe("configuración de WhatsApp", () => {
  it("acepta los datos de Meta y rechaza valores mal copiados", () => {
    expect(whatsappAccountSchema.safeParse({ phone_number_id: "106540352242922", display_phone: "+52 55 1234 5678", app_secret: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }).success).toBe(true);
    expect(whatsappAccountSchema.safeParse({ phone_number_id: "+52 55", display_phone: "+52 55 1234 5678", app_secret: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" }).success).toBe(false);
    expect(whatsappAccountSchema.safeParse({ phone_number_id: "106540352242922", display_phone: "+52 55 1234 5678", app_secret: "EAAG-token-de-acceso" }).success).toBe(false);
  });
});
