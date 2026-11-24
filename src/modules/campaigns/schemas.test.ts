import { describe, expect, it } from "vitest";
import { campaignSchema, costSchema, segmentSchema, stepSchema } from "./schemas";

describe("campañas", () => {
  const base = { name: "Regreso a clases", campaign_type: "email", start_date: "2027-01-10", currency_code: "MXN" };
  it("valida fechas y tipo", () => {
    expect(campaignSchema.safeParse(base).success).toBe(true);
    expect(campaignSchema.safeParse({ ...base, end_date: "2027-01-01" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, campaign_type: "spam" }).success).toBe(false);
  });
  it("plantilla: sin fecha y con origen opcional", () => {
    expect(campaignSchema.safeParse({ ...base, start_date: "" }).success).toBe(false);
    const t = campaignSchema.parse({ ...base, start_date: "", is_template: "on", source_id: "" });
    expect(t).toMatchObject({ is_template: true, start_date: null, source_id: null });
    expect(campaignSchema.parse(base).is_template).toBe(false);
    expect(campaignSchema.safeParse({ ...base, source_id: "no-es-uuid" }).success).toBe(false);
  });
  it("meta de leads opcional, entera y positiva", () => {
    expect(campaignSchema.parse({ ...base, lead_goal: "" }).lead_goal).toBeNull();
    expect(campaignSchema.parse({ ...base, lead_goal: "25" }).lead_goal).toBe(25);
    expect(campaignSchema.safeParse({ ...base, lead_goal: "0" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, lead_goal: "2.5" }).success).toBe(false);
    expect(costSchema.parse({ actual_cost: "100", lead_goal: "" })).toEqual({ actual_cost: 100, lead_goal: null });
  });
  it("normaliza el segmento", () => {
    expect(segmentSchema.parse({ country: "mx", types: ["school"], owner: "", status: "" })).toMatchObject({ country: "MX", types: ["school"], owner: null, status: null });
    expect(segmentSchema.safeParse({ types: ["castillo"] }).success).toBe(false);
  });
});

describe("pasos de secuencia", () => {
  it("acepta día, tipo y asunto", () => {
    expect(stepSchema.parse({ day_offset: "3", activity_type: "email", subject: " Enviar folleto " })).toEqual({ day_offset: 3, activity_type: "email", subject: "Enviar folleto" });
  });
  it("rechaza días negativos o fraccionarios", () => {
    expect(stepSchema.safeParse({ day_offset: "-1", activity_type: "call", subject: "Llamar" }).success).toBe(false);
    expect(stepSchema.safeParse({ day_offset: "1.5", activity_type: "call", subject: "Llamar" }).success).toBe(false);
  });
});
