import { describe, expect, it } from "vitest";
import { expectedPct, nextPeriod, periodRange, shiftMonths } from "./period";

describe("periodRange", () => {
  it("mes, trimestre y año calendario", () => {
    expect(periodRange("month", "2027-02-14")).toEqual({ start: "2027-02-01", end: "2027-02-28" });
    expect(periodRange("quarter", "2027-05-20")).toEqual({ start: "2027-04-01", end: "2027-06-30" });
    expect(periodRange("year", "2027-12-31")).toEqual({ start: "2027-01-01", end: "2027-12-31" });
  });
});

describe("nextPeriod", () => {
  it("corre meses completos respetando fin de mes", () => {
    expect(nextPeriod("2027-01-01", "2027-01-31")).toEqual({ start: "2027-02-01", end: "2027-02-28" });
    expect(nextPeriod("2027-10-01", "2027-12-31")).toEqual({ start: "2028-01-01", end: "2028-03-31" });
    expect(nextPeriod("2027-01-01", "2027-12-31")).toEqual({ start: "2028-01-01", end: "2028-12-31" });
  });
  it("periodos libres se corren por el mismo número de días", () => {
    expect(nextPeriod("2027-01-10", "2027-01-23")).toEqual({ start: "2027-01-24", end: "2027-02-06" });
  });
});

describe("expectedPct", () => {
  it("avance esperado según días transcurridos", () => {
    expect(expectedPct("2027-01-01", "2027-01-10", "2027-01-05")).toBe(50);
    expect(expectedPct("2027-01-01", "2027-01-10", "2027-01-10")).toBe(100);
    expect(expectedPct("2027-01-01", "2027-01-10", "2026-12-31")).toBeNull();
    expect(expectedPct("2027-01-01", "2027-01-10", "2027-01-11")).toBeNull();
  });
});

describe("shiftMonths", () => {
  it("corre meses hacia atrás recortando al fin de mes", () => {
    expect(shiftMonths("2026-11-24", 1)).toBe("2026-10-24");
    expect(shiftMonths("2027-03-31", 1)).toBe("2027-02-28");
    expect(shiftMonths("2027-02-15", 3)).toBe("2026-11-15");
    expect(shiftMonths("2027-01-01", 12)).toBe("2026-01-01");
  });
});
