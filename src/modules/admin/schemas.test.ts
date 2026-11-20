import { describe, expect, it } from "vitest";
import { automationSchema, companySchema, invitationSchema, officeSchema } from "./schemas";

const uuid = "3f1c2a8e-9b7d-4c1e-8a2b-1d2e3f4a5b6c";

describe("admin schemas", () => {
  it("normaliza país y RFC vacío", () => {
    expect(companySchema.parse({ legal_name: " E2 Square SA ", tax_id: "", country_code: "mx" })).toEqual({
      legal_name: "E2 Square SA",
      tax_id: null,
      country_code: "MX",
    });
  });

  it("rechaza país inválido", () => {
    expect(companySchema.safeParse({ legal_name: "E2", tax_id: "", country_code: "MEX" }).success).toBe(false);
  });

  it("oficina: unidad opcional y zona horaria IANA", () => {
    const base = { name: "CDMX", company_id: uuid, business_unit_id: "", country_code: "MX" };
    expect(officeSchema.parse({ ...base, timezone: "America/Mexico_City" }).business_unit_id).toBeNull();
    expect(officeSchema.safeParse({ ...base, timezone: "Mexico/Inventada" }).success).toBe(false);
  });

  it("invitación normaliza el correo", () => {
    expect(invitationSchema.parse({ email: " Ana@Colegio.MX ", role_id: uuid }).email).toBe("ana@colegio.mx");
  });
});

describe("automationSchema", () => {
  it("lee la casilla y limita los días", () => {
    expect(automationSchema.parse({ key: "first_contact", enabled: "on", days: "1" })).toEqual({ key: "first_contact", enabled: true, days: 1 });
    expect(automationSchema.parse({ key: "won_handoff", days: "0" }).enabled).toBe(false);
    expect(automationSchema.safeParse({ key: "first_contact", days: "91" }).success).toBe(false);
    expect(automationSchema.safeParse({ key: "otra", days: "1" }).success).toBe(false);
  });
});
