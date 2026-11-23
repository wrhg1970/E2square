import { describe, expect, it } from "vitest";
import { decisionSchema, parseTiers, rateSchema, settingsSchema } from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";

describe("rateSchema", () => {
  it("acepta un porcentaje sobre venta o margen", () => {
    expect(rateSchema.parse({ profile_id: id, product_id: id, rate_pct: "7.5", basis: "margin" }).rate_pct).toBe(7.5);
  });
  it("rechaza 0, más de 100 y bases desconocidas", () => {
    expect(rateSchema.safeParse({ profile_id: id, product_id: id, rate_pct: "0", basis: "sale" }).success).toBe(false);
    expect(rateSchema.safeParse({ profile_id: id, product_id: id, rate_pct: "101", basis: "sale" }).success).toBe(false);
    expect(rateSchema.safeParse({ profile_id: id, product_id: id, rate_pct: "5", basis: "utilidad" }).success).toBe(false);
  });
});

describe("decisionSchema", () => {
  it("rechazar exige motivo; aprobar no", () => {
    expect(decisionSchema.safeParse({ id, status: "rejected", note: "  " }).success).toBe(false);
    expect(decisionSchema.safeParse({ id, status: "approved" }).success).toBe(true);
  });
});

describe("parseTiers", () => {
  it("lee y ordena los escalones", () => {
    expect(parseTiers("120:2, 100 : 1")).toEqual([{ min_pct: 100, extra_pct: 1 }, { min_pct: 120, extra_pct: 2 }]);
    expect(parseTiers("")).toEqual([]);
  });
  it("rechaza formatos y valores inválidos", () => {
    expect(parseTiers("100-1")).toBeNull();
    expect(parseTiers("100:0")).toBeNull();
    expect(parseTiers("0:2")).toBeNull();
  });
});

describe("settingsSchema", () => {
  it("convierte el formulario en la configuración", () => {
    expect(settingsSchema.parse({ new_institution_bonus: "500", bonus_currency: "MXN", require_collection: "on", tiers: "100:1" }))
      .toEqual({ new_institution_bonus: 500, bonus_currency: "MXN", require_collection: true, tiers: [{ min_pct: 100, extra_pct: 1 }] });
    expect(settingsSchema.parse({ new_institution_bonus: "0", bonus_currency: "USD", tiers: "" }).require_collection).toBe(false);
    expect(settingsSchema.safeParse({ new_institution_bonus: "0", bonus_currency: "USD", tiers: "cien" }).success).toBe(false);
  });
});
