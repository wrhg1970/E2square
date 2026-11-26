import { describe, expect, it } from "vitest";
import { bulkSchema, notesSchema } from "./schemas";

const id = "00000000-0000-4000-8000-000000000001";

describe("bulkSchema", () => {
  it("acepta archivar, borrar y cambiar estatus", () => {
    expect(bulkSchema.safeParse({ op: "archive", ids: [id] }).success).toBe(true);
    expect(bulkSchema.safeParse({ op: "delete", ids: [id] }).success).toBe(true);
    expect(bulkSchema.safeParse({ op: "status", status: "qualified", ids: [id] }).success).toBe(true);
  });
  it("pide estatus válido, selección y ids reales", () => {
    expect(bulkSchema.safeParse({ op: "status", ids: [id] }).success).toBe(false);
    expect(bulkSchema.safeParse({ op: "status", status: "otro", ids: [id] }).success).toBe(false);
    expect(bulkSchema.safeParse({ op: "archive", ids: [] }).error?.issues[0].message).toBe("Selecciona al menos un prospecto");
    expect(bulkSchema.safeParse({ op: "delete", ids: ["1 or 1=1"] }).success).toBe(false);
    expect(bulkSchema.safeParse({ op: "drop", ids: [id] }).success).toBe(false);
    expect(bulkSchema.safeParse({ op: "archive", ids: Array(501).fill(id) }).success).toBe(false);
  });
});

describe("notesSchema", () => {
  it("vacío se guarda como null y limita el largo", () => {
    expect(notesSchema.parse({ notes: "  " }).notes).toBeNull();
    expect(notesSchema.safeParse({ notes: "x".repeat(4001) }).success).toBe(false);
  });
});
