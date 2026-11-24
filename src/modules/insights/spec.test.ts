import { describe, expect, it } from "vitest";
import { parseAiSpec } from "./spec";

describe("parseAiSpec", () => {
  it("acepta el JSON aunque venga en un bloque de código", () => {
    expect(parseAiSpec('```json\n{"metric":"won_amount","group":"supplier","from":"2026-10-01","to":"2026-10-31"}\n```'))
      .toEqual({ metric: "won_amount", group: "supplier", from: "2026-10-01", to: "2026-10-31" });
  });
  it("rechaza indicadores fuera del menú", () => {
    expect(parseAiSpec('{"metric":"salaries","group":"total","from":"2026-01-01","to":"2026-12-31"}')).toHaveProperty("error");
  });
  it("pasa la explicación cuando la IA no puede responder", () => {
    expect(parseAiSpec('{"error":"No hay datos de clima"}')).toEqual({ error: "No hay datos de clima" });
  });
  it("rechaza texto sin JSON", () => {
    expect(parseAiSpec("No sé")).toHaveProperty("error");
  });
});
