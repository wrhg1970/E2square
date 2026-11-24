import { describe, expect, it } from "vitest";
import { formatMoney, initials, totalsByCurrency } from "./labels";
import { itemSchema } from "./schemas";

describe("dinero", () => {
  it("formatea y suma por moneda sin mezclar", () => {
    expect(formatMoney(4500, "USD")).toMatch(/4,500/);
    const rows = [{ c: "USD", v: 100 }, { c: "MXN", v: 50 }, { c: "USD", v: 25 }];
    const out = totalsByCurrency(rows, (r) => r.c, (r) => r.v);
    expect(out).toMatch(/125/);
    expect(out).toMatch(/50/);
    expect(out.split(" + ")).toHaveLength(2);
  });

  it("línea: descuento y costo opcionales, cantidad positiva", () => {
    const uuid = "3f1c2a8e-9b7d-4c1e-8a2b-1d2e3f4a5b6c";
    expect(itemSchema.parse({ product_id: uuid, quantity: "30", unit_price: "150", discount_pct: "", unit_cost: "" })).toMatchObject({
      quantity: 30, unit_price: 150, discount_pct: 0, unit_cost: 0,
    });
    expect(itemSchema.safeParse({ product_id: uuid, quantity: "0", unit_price: "1" }).success).toBe(false);
  });
});

describe("iniciales", () => {
  it("toma nombre y apellido, o el correo si no hay nombre", () => {
    expect(initials("Laura Méndez Ruiz")).toBe("LM");
    expect(initials(null, "ana.rios@e2.com")).toBe("AR");
    expect(initials("  ", null)).toBe("?");
  });
});
