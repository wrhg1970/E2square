import { describe, expect, it } from "vitest";
import { dayIn, utcToLocalInput, zonedToUtc, addDays, weekStart, formatDay, calendarDays, stepCalendar } from "./time";

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

describe("fechas sin hora", () => {
  it("no recorre el día por zona horaria", () => {
    expect(formatDay("2027-01-01")).toMatch(/^1 ene\.? 2027$/);
    expect(formatDay("2027-01-12T00:00:00+00:00")).toMatch(/^12 ene/);
  });
});

describe("vistas del calendario", () => {
  it("día, semana y mes en semanas completas", () => {
    expect(calendarDays("dia", "2026-11-24")).toEqual(["2026-11-24"]);
    expect(calendarDays("semana", "2026-11-24")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    const nov = calendarDays("mes", "2026-11-24");
    expect([nov[0], nov.at(-1), nov.length]).toEqual(["2026-10-26", "2026-12-06", 42]);
    const feb = calendarDays("mes", "2027-02-10"); // febrero 2027 empieza en lunes y dura 4 semanas justas
    expect([feb[0], feb.at(-1), feb.length]).toEqual(["2027-02-01", "2027-02-28", 28]);
  });
  it("avanza y retrocede según la vista, cruzando años", () => {
    expect(stepCalendar("dia", "2026-12-31", 1)).toBe("2027-01-01");
    expect(stepCalendar("semana", "2026-11-24", -1)).toBe("2026-11-17");
    expect(stepCalendar("mes", "2026-12-31", 1)).toBe("2027-01-01");
    expect(stepCalendar("mes", "2027-01-15", -1)).toBe("2026-12-01");
  });
});
