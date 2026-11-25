import { describe, expect, it } from "vitest";
import { aiEnv, webSearchType } from "./config";
import { opportunityBrief } from "./brief";

describe("webSearchType", () => {
  it("Haiku usa la búsqueda web básica; Opus y Sonnet la de filtrado dinámico", () => {
    expect(webSearchType("claude-haiku-5-5")).toBe("web_search_20250305");
    expect(webSearchType("claude-sonnet-5-5")).toBe("web_search_20260209");
  });
});

describe("aiEnv", () => {
  it("queda apagada sin proveedor o sin clave", () => {
    expect(aiEnv({})).toBeNull();
    expect(aiEnv({ AI_PROVIDER: "gemini" })).toBeNull();
    expect(aiEnv({ AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "x".repeat(30) })).toBeNull();
  });
  it("acepta Gemini o Claude con su clave y modelo opcional", () => {
    expect(aiEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g".repeat(30) })?.AI_PROVIDER).toBe("gemini");
    expect(aiEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a".repeat(30), AI_MODEL: "" })?.AI_MODEL).toBeUndefined();
  });
});

describe("opportunityBrief", () => {
  const base = { name: "IHS 2027", institution: "Colegio Sol", supplier: "IHS", stage: "Propuesta", status: "open", amount: 5000,
    currency: "USD", probability: 50, expectedClose: null, today: "2026-11-20", items: [], activities: [] };
  it("dice explícitamente lo que falta en vez de omitirlo", () => {
    const p = opportunityBrief(base);
    expect(p).toContain("Cierre estimado: sin fecha");
    expect(p).toContain("Productos: ninguno");
    expect(p).toContain("- ninguna");
  });
  it("limita actividades y recorta textos largos", () => {
    const acts = Array.from({ length: 30 }, (_, i) => ({ type: "call", subject: "x".repeat(500), status: "done", when: `d${i}`, outcome: null }));
    const p = opportunityBrief({ ...base, activities: acts });
    expect(p.split("\n").filter((l) => l.startsWith("- d"))).toHaveLength(15);
    expect(p).not.toContain("x".repeat(200));
  });
});
