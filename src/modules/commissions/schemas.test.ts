import { describe, expect, it } from "vitest";
import { decisionSchema, rateSchema } from "./schemas";

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
