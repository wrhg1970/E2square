import { describe, expect, it } from "vitest";
import { changes } from "./diff";

describe("changes", () => {
  it("muestra solo los campos que cambiaron, sin ruido técnico", () => {
    expect(changes({ id: "1", amount: 100, stage: "a", updated_at: "x" }, { id: "1", amount: 150, stage: "a", updated_at: "y" }))
      .toEqual(["amount: 100 → 150"]);
  });
  it("en un alta lista los valores no vacíos", () => {
    expect(changes(null, { id: "1", name: "Colegio", notes: null, organization_id: "o" })).toEqual(["name: Colegio"]);
  });
  it("en una baja usa los datos anteriores y marca vacíos", () => {
    expect(changes({ id: "1", name: "X" }, null)).toEqual(["name: X"]);
    expect(changes({ phone: "1" }, { phone: null })).toEqual(["phone: 1 → —"]);
  });
});
