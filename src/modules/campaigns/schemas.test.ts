import { describe, expect, it } from "vitest";
import { campaignSchema, segmentSchema } from "./schemas";

describe("campañas", () => {
  const base = { name: "Regreso a clases", campaign_type: "email", start_date: "2027-01-10", currency_code: "MXN" };
  it("valida fechas y tipo", () => {
    expect(campaignSchema.safeParse(base).success).toBe(true);
    expect(campaignSchema.safeParse({ ...base, end_date: "2027-01-01" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...base, campaign_type: "spam" }).success).toBe(false);
  });
  it("normaliza el segmento", () => {
    expect(segmentSchema.parse({ country: "mx", types: ["school"], owner: "", status: "" })).toMatchObject({ country: "MX", types: ["school"], owner: null, status: null });
    expect(segmentSchema.safeParse({ types: ["castillo"] }).success).toBe(false);
  });
});
