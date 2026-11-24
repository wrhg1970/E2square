import { describe, expect, it } from "vitest";
import { parseAiSpec, quickRanges } from "./spec";

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

describe("quickRanges", () => {
  it("calcula mes pasado y trimestre, incluso al cruzar de año", () => {
    const r = Object.fromEntries(quickRanges("2027-01-15").map((x) => [x.label, [x.from, x.to]]));
    expect(r["Mes pasado"]).toEqual(["2026-12-01", "2026-12-31"]);
    expect(r["Este trimestre"]).toEqual(["2027-01-01", "2027-01-15"]);
    expect(r["Año pasado"]).toEqual(["2026-01-01", "2026-12-31"]);
  });
  it("respeta febrero de año bisiesto", () => {
    expect(quickRanges("2028-03-10").find((x) => x.label === "Mes pasado")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });
});
