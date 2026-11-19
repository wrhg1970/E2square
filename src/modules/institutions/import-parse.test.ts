import { describe, expect, it } from "vitest";
import { mapHeaders, parseCsv, parseRows } from "./import-parse";

describe("parseCsv", () => {
  it("maneja comillas, comas internas, punto y coma y BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","di ""hola"""\n')).toEqual([["a", "b"], ["x, y", 'di "hola"']]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("mapHeaders", () => {
  it("reconoce encabezados con acentos, mayúsculas y alias", () => {
    const { fields, unknown } = mapHeaders(["Nombre", "País", "RFC", "Columna rara"]);
    expect(fields).toEqual(["name", "country_code", "tax_id", null]);
    expect(unknown).toEqual(["Columna rara"]);
  });
});

describe("parseRows", () => {
  const header = ["nombre", "tipo", "pais", "ciudad", "potencial", "contacto_nombre", "contacto_correo", "contacto_rol"];

  it("convierte etiquetas en español y arma el contacto", () => {
    const { valid, errors } = parseRows([header, ["Colegio Sol", "Colegio", "mx", "Puebla", "alto", "Ana", "ANA@sol.mx", "Decisor"]]);
    expect(errors).toEqual([]);
    expect(valid[0].institution).toMatchObject({ name: "Colegio Sol", institution_type: "school", country_code: "MX", potential: "high" });
    expect(valid[0].contact).toMatchObject({ first_name: "Ana", email: "ana@sol.mx", decision_role: "decision_maker" });
  });

  it("reporta fila, campo y sugerencia; omite filas vacías y repetidas", () => {
    const { valid, errors } = parseRows([
      header,
      ["Colegio Sol", "Colegio", "MX", "Puebla", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["Colegio  sol", "Colegio", "MX", "Puebla", "", "", "", ""],
      ["X", "Escuelita", "México", "", "", "Luis", "no-es-correo", ""],
    ]);
    expect(valid).toHaveLength(1);
    expect(errors).toContainEqual({ row: 4, field: "name", message: "Repetida en el archivo (fila 2)" });
    expect(errors.filter((e) => e.row === 5).map((e) => e.field).sort()).toEqual(["contact.email", "country_code", "institution_type", "name"]);
    expect(errors.find((e) => e.field === "institution_type")?.message).toMatch(/^Usa: Colegio/);
  });
});
