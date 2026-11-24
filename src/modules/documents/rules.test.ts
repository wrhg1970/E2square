import { describe, expect, it } from "vitest";
import { matchesValidity, safeFileName, validateFile, validityLabel, validityOf } from "./rules";

describe("documentos", () => {
  it("limpia el nombre para la ruta", () => {
    expect(safeFileName("Propuesta Colegio Hamilton – 2027.pdf")).toBe("Propuesta-Colegio-Hamilton-2027.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(safeFileName("###")).toBe("archivo");
  });
  it("valida tamaño y tipo", () => {
    expect(validateFile({ name: "a.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(validateFile({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatch(/no permitido/);
    expect(validateFile({ name: "a.pdf", size: 16 * 1024 * 1024, type: "application/pdf" })).toMatch(/15 MB/);
    expect(validateFile({ name: "", size: 0, type: "" })).toMatch(/Elige/);
  });
});

describe("vigencia", () => {
  const today = "2026-11-24";
  it("clasifica por días que faltan", () => {
    expect(validityOf(null, today)).toEqual({ kind: "none" });
    expect(validityOf("2026-11-23", today)).toEqual({ kind: "expired", days: -1 });
    expect(validityOf("2026-11-24", today)).toEqual({ kind: "soon", days: 0 });
    expect(validityOf("2026-12-24", today)).toEqual({ kind: "soon", days: 30 });
    expect(validityOf("2026-12-25", today)).toEqual({ kind: "valid", days: 31 });
  });
  it("redacta el estatus", () => {
    expect(validityLabel(validityOf("2026-09-29", today))).toBe("Vencido hace 56 días");
    expect(validityLabel(validityOf("2026-11-24", today))).toBe("Vence hoy");
    expect(validityLabel(validityOf("2026-11-25", today))).toBe("Vence mañana");
    expect(validityLabel(validityOf("2027-08-01", today))).toBe("Vigente");
    expect(validityLabel(validityOf(undefined, today))).toBe("Sin vigencia");
  });
  it("filtra por vigencia", () => {
    expect(matchesValidity(validityOf("2026-12-01", today), "por_vencer")).toBe(true);
    expect(matchesValidity(validityOf("2026-12-01", today), "vigentes")).toBe(false);
    expect(matchesValidity(validityOf(null, today), "sin_vigencia")).toBe(true);
  });
});
