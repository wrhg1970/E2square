import { describe, expect, it } from "vitest";
import { goalSchema } from "./schemas";

const base = { name: "Meta Q1", period_start: "2027-01-01", period_end: "2027-03-31", target: "100", owner_id: "", office_id: "", product_id: "" };

describe("goalSchema", () => {
  it("exige moneda en metas de dinero", () => {
    expect(goalSchema.safeParse({ ...base, metric: "revenue", currency_code: "" }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, metric: "revenue", currency_code: "USD" }).success).toBe(true);
  });
  it("descarta la moneda en metas de conteo", () => {
    const r = goalSchema.parse({ ...base, metric: "units", currency_code: "USD" });
    expect(r.currency_code).toBeNull();
    expect(r.owner_id).toBeNull();
  });
  it("rechaza periodos invertidos", () => {
    expect(goalSchema.safeParse({ ...base, metric: "units", currency_code: "", period_end: "2026-12-31" }).success).toBe(false);
  });
});
