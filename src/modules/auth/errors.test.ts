import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./errors";

describe("signInErrorMessage", () => {
  it("distingue las causas comunes", () => {
    expect(signInErrorMessage({ code: "invalid_credentials", status: 400 })).toBe("Correo o contraseña incorrectos.");
    expect(signInErrorMessage({ code: "email_not_confirmed", status: 400 })).toMatch(/no está confirmado/);
    expect(signInErrorMessage({ status: 401, message: "Invalid API key" })).toMatch(/llave/);
    expect(signInErrorMessage({ name: "AuthRetryableFetchError", status: 0 })).toMatch(/conexión/);
  });
});
