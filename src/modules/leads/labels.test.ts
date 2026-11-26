import { describe, expect, it } from "vitest";
import { phoneDigits, receivedAgo } from "./labels";

describe("receivedAgo", () => {
  const now = new Date("2026-11-26T18:00:00Z");
  it("da minutos, horas, ayer y días", () => {
    expect(receivedAgo("2026-11-26T17:59:40Z", now)).toBe("ahora");
    expect(receivedAgo("2026-11-26T17:35:00Z", now)).toBe("hace 25 min");
    expect(receivedAgo("2026-11-26T13:00:00Z", now)).toBe("hace 5 h");
    expect(receivedAgo("2026-11-25T12:00:00Z", now)).toBe("ayer");
    expect(receivedAgo("2026-11-22T12:00:00Z", now)).toBe("hace 4 días");
  });
  it("después de una semana da la fecha", () => {
    expect(receivedAgo("2026-10-22T14:09:00Z", now)).toMatch(/22 oct/);
  });
});

describe("phoneDigits", () => {
  it("agrega la lada según el país cuando vienen 10 dígitos", () => {
    expect(phoneDigits("664 376 9376", "México")).toBe("526643769376");
    expect(phoneDigits("(760) 555-0101", "Estados Unidos")).toBe("17605550101");
    expect(phoneDigits("7605550101", "US")).toBe("17605550101");
    expect(phoneDigits("6643769376", null)).toBe("526643769376");
  });
  it("respeta números que ya traen lada", () => {
    expect(phoneDigits("+52 1 664 376 9376")).toBe("5216643769376");
    expect(phoneDigits("+1 760 555 0101", "México")).toBe("17605550101");
  });
});
