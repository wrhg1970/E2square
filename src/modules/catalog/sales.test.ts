import { describe, expect, it } from "vitest";
import { supplierSales, type SaleRow } from "./sales";

const row = (status: string, amount: number, closed: string | null, currency = "USD"): SaleRow =>
  ({ status, amount, currency_code: currency, probability: 50, closed_at: closed, updated_at: "2026-02-10T00:00:00Z" });

describe("ventas del proveedor", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const rows = [
    row("won", 1000, "2026-11-03T00:00:00Z"),
    row("won", 500, "2025-12-15T00:00:00Z"),
    row("won", 300, null), // sin fecha de cierre: usa la última actualización (feb 2026)
    row("won", 900, "2026-11-05T00:00:00Z", "MXN"),
    row("won", 50, "2024-01-01T00:00:00Z"),
    row("open", 2000, null),
    row("lost", 100, "2026-05-01T00:00:00Z"),
  ];
  const s = supplierSales(rows, "USD", now);

  it("separa ganadas del año y abiertas", () => {
    expect(s.wonYear.map((r) => r.amount)).toEqual([1000, 300, 900]);
    expect(s.open).toHaveLength(1);
    expect(s.winRate).toBe(83); // 5 ganadas de 6 cerradas
  });

  it("serie de 12 meses en la moneda del proveedor, sin mezclar otras", () => {
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly[0]).toMatchObject({ key: "2025-12", value: 500 });
    expect(s.monthly[11]).toMatchObject({ key: "2026-11", name: "nov 26", value: 1000 });
    expect(s.monthly.find((m) => m.key === "2026-02")?.value).toBe(300);
    expect(s.otherCurrency).toBe(true);
  });

  it("sin cierres no hay tasa de cierre", () => {
    expect(supplierSales([row("open", 1, null)], "USD", now).winRate).toBeNull();
  });
});
