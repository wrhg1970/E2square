import { describe, expect, it } from "vitest";
import { scoreWeightsSchema } from "./scoring";

const base = { fit: "20", need: "15", engagement: "15", decision_access: "15", budget: "10", urgency: "10", recency: "15" };

describe("scoreWeightsSchema", () => {
  it("acepta enteros de 0 a 100", () => {
    expect(scoreWeightsSchema.parse(base).fit).toBe(20);
  });
  it("rechaza fuera de rango y decimales", () => {
    expect(scoreWeightsSchema.safeParse({ ...base, fit: "101" }).success).toBe(false);
    expect(scoreWeightsSchema.safeParse({ ...base, fit: "2.5" }).success).toBe(false);
  });
  it("exige al menos un peso mayor que 0", () => {
    const zeros = Object.fromEntries(Object.keys(base).map((k) => [k, "0"]));
    expect(scoreWeightsSchema.safeParse(zeros).success).toBe(false);
  });
});
