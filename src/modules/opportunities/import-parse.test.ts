import { describe, expect, it } from "vitest";
import { parseOpportunityRows } from "./import-parse";

describe("parseOpportunityRows", () => {
  it("lee encabezados con variantes, montos con formato y fechas DD/MM/AAAA", () => {
    const { valid, errors, unknownColumns } = parseOpportunityRows([
      ["Colegio", "Proveedor", "Importe", "Estatus", "Fecha de cierre", "Vendedor", "Otra"],
      ["Colegio Uno", "TOEFL", "$12,500.50", "ganada", "30/06/2025", "Ana@Mail.mx", "x"],
      ["", "", "", "", "", "", ""],
    ]);
    expect(errors).toEqual([]);
    expect(unknownColumns).toEqual(["Otra"]);
    expect(valid).toEqual([expect.objectContaining({
      row: 2, institution: "Colegio Uno", supplier: "TOEFL", amount: 12500.5, currency: "MXN", status: "won", close_date: "2025-06-30", owner: "ana@mail.mx",
    })]);
  });
  it("reporta por fila lo que falta o no se entiende", () => {
    const { valid, errors } = parseOpportunityRows([
      ["institucion", "proveedor", "monto", "estado", "fecha_cierre", "moneda"],
      ["Colegio Dos", "IHS", "abc", "Perdida", "", "PESOS"],
    ]);
    expect(valid).toEqual([]);
    expect(errors.map((e) => e.field).sort()).toEqual(["amount", "currency"]);
  });
  it("una ganada sin fecha de cierre es error; una abierta no", () => {
    const rows = (status: string) => parseOpportunityRows([["institucion", "proveedor", "monto", "estado"], ["C", "P", "1", status]]);
    expect(rows("Ganada").errors[0]).toMatchObject({ field: "close_date" });
    expect(rows("Abierta").valid).toHaveLength(1);
  });
});
