import { describe, expect, it } from "vitest";
import { goalSchema, parseSplit } from "./schemas";

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

describe("goalSchema con periodo predefinido", () => {
  it("calcula las fechas del trimestre y omite el fin capturado", () => {
    const r = goalSchema.parse({ ...base, metric: "units", currency_code: "", period_kind: "quarter", period_start: "2027-02-10", period_end: "" });
    expect([r.period_start, r.period_end]).toEqual(["2027-01-01", "2027-03-31"]);
    expect("period_kind" in r).toBe(false);
  });
  it("con fechas a mano exige ambas", () => {
    expect(goalSchema.safeParse({ ...base, metric: "units", currency_code: "", period_kind: "custom", period_end: "" }).success).toBe(false);
  });
});

describe("parseSplit", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  it("sin montos reparte en partes iguales", () => {
    expect(parseSplit([a, b], () => "")).toEqual({ owners: [a, b], targets: null });
  });
  it("con montos exige uno por vendedor", () => {
    expect(parseSplit([a, b], (id) => (id === a ? "300" : "200"))).toEqual({ owners: [a, b], targets: [300, 200] });
    expect(parseSplit([a, b], (id) => (id === a ? "300" : ""))).toHaveProperty("error");
  });
  it("pide al menos dos vendedores", () => {
    expect(parseSplit([a], () => "")).toHaveProperty("error");
  });
});

describe("meta de equipo", () => {
  it("no admite vendedor y equipo a la vez", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(goalSchema.safeParse({ ...base, metric: "units", owner_id: id, team_id: id }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, metric: "units", currency_code: "", team_id: id }).success).toBe(true);
  });
});
