import { describe, expect, it } from "vitest";
import { monthRange } from "./period";

describe("monthRange", () => {
  it("usa medianoche de Ciudad de México y cruza de año", () => {
    expect(monthRange("2026-12", "America/Mexico_City")).toEqual({
      month: "2026-12", from: "2026-12-01T06:00:00.000Z", to: "2027-01-01T06:00:00.000Z",
    });
  });
  it("con un mes inválido toma el mes actual del usuario", () => {
    // 1 de enero 03:00 UTC sigue siendo 31 de diciembre en México.
    expect(monthRange("2026-13", "America/Mexico_City", new Date("2027-01-01T03:00:00Z")).month).toBe("2026-12");
    expect(monthRange(undefined, "America/Mexico_City", new Date("2027-01-01T03:00:00Z")).month).toBe("2026-12");
  });
});
