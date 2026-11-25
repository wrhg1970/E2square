import { describe, expect, it } from "vitest";
import { cleanAnswer, parseLeadRows } from "./import-parse";

describe("cleanAnswer", () => {
  it("limpia las respuestas de opción que exporta Meta", () => {
    expect(cleanAnswer("__\u2060padre/madre/tutor___\u2060")).toBe("Padre/madre/tutor");
    expect(cleanAnswer("\u2060__\u2060estudiante_interesado_(11–19_años")).toBe("Estudiante interesado (11–19 años)");
    expect(cleanAnswer("3ro_de_preparatoria_12th_grade_(_)")).toBe("3ro de preparatoria 12th grade");
    expect(cleanAnswer("13-15_años_")).toBe("13-15 años");
    expect(cleanAnswer("Padre/madre/tutor")).toBe("Padre/madre/tutor");
  });
});

describe("parseLeadRows", () => {
  const header = ["Lead ID", "Nombre", "Correo", "Telefono", "Ciudad", "Estado", "País", "Quien llena", "Edad", "Grado escolar", "Fecha", "Hora", ""];
  it("lee la hoja de Meta, incluida la columna de notas sin encabezado", () => {
    const { valid, errors, unknownColumns } = parseLeadRows([
      header,
      ["1000000000000001", "Ana Prueba", "Ana_Prueba@Example.com", "525500000000", "Ciudad Ejemplo", "Chihuahua", "México", "Padre/madre/tutor", "13-15 años", "3ro de secundaria 9th grade", "2026-07-21", "19:45:00", "No contesta"],
      ["", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["2", "Sin datos", "", "", "", "", "", "", "", "", "21/07/2026", "", ""],
      ["3", "Mal", "no-es-correo", "55", "", "", "", "", "", "", "ayer", "", ""],
    ]);
    expect(unknownColumns).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({
      row: 2, external_id: "1000000000000001", full_name: "Ana Prueba", email: "ana_prueba@example.com",
      region: "Chihuahua", grade: "3ro de secundaria 9th grade", date: "2026-07-21", time: "19:45", notes: "No contesta",
    });
    expect(errors.map((e) => [e.row, e.field])).toEqual([[4, "email"], [5, "email"], [5, "date"]]);
  });
});
