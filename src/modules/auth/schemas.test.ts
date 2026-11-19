import { describe, expect, it } from "vitest";
import { newPasswordSchema, safeNextPath, signInSchema } from "./schemas";

describe("auth schemas", () => {
  it("normaliza el correo", () => {
    expect(signInSchema.parse({ email: "  Will@E2Square.com ", password: "x" }).email).toBe("will@e2square.com");
  });

  it("exige contraseñas iguales y de 10+ caracteres", () => {
    expect(newPasswordSchema.safeParse({ password: "corta", confirm: "corta" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "suficiente1", confirm: "otra-cosa1" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "suficiente1", confirm: "suficiente1" }).success).toBe(true);
  });

  it("solo permite redirecciones internas", () => {
    expect(safeNextPath("/restablecer")).toBe("/restablecer");
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
