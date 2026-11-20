import { describe, expect, it } from "vitest";
import { safeFileName, validateFile } from "./rules";

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
