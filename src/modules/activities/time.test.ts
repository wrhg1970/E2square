import { describe, expect, it } from "vitest";
import { dayIn, utcToLocalInput, zonedToUtc, addDays, weekStart } from "./time";

describe("zonas horarias", () => {
  it("convierte hora local a UTC (CDMX sin horario de verano, UTC-6)", () => {
    expect(zonedToUtc("2026-11-20T10:30", "America/Mexico_City").toISOString()).toBe("2026-11-20T16:30:00.000Z");
  });
  it("respeta horario de verano (Madrid en julio, UTC+2)", () => {
    expect(zonedToUtc("2026-07-01T09:00", "Europe/Madrid").toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });
  it("ida y vuelta para el input", () => {
    expect(utcToLocalInput("2026-11-20T16:30:00Z", "America/Bogota")).toBe("2026-11-20T11:30");
  });
  it("día calendario en la zona del usuario", () => {
    expect(dayIn(new Date("2026-11-21T03:00:00Z"), "America/Mexico_City")).toBe("2026-11-20");
  });
  it("rechaza formatos inválidos", () => {
    expect(() => zonedToUtc("20/11/2026", "America/Mexico_City")).toThrow();
  });
});

describe("semanas", () => {
  it("encuentra el lunes y cruza meses", () => {
    expect(weekStart("2026-11-19")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});
