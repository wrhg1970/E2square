import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";
import { extractEmails, gmailQuery, matchMessage } from "./gmail";

describe("crypto", () => {
  const key = randomBytes(32).toString("base64");
  it("cifra y descifra; con otra llave falla", () => {
    const sealed = encrypt("1//refresh-token", key);
    expect(sealed).not.toContain("refresh");
    expect(decrypt(sealed, key)).toBe("1//refresh-token");
    expect(() => decrypt(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});

describe("gmail", () => {
  it("extrae correos de encabezados con nombres", () => {
    expect(extractEmails('"Pérez, Ana" <Ana@Colegio.MX>, b@y.com')).toEqual(["ana@colegio.mx", "b@y.com"]);
  });

  const contacts = new Map([["ana@colegio.mx", { contact_id: "c1", institution_id: "i1" }]]);
  const msg = (from: string, to: string) => ({
    id: "m1", threadId: "t1", snippet: "Hola", internalDate: "1795000000000",
    payload: { headers: [{ name: "From", value: from }, { name: "To", value: to }, { name: "Subject", value: "Propuesta" }] },
  });

  it("asocia correos recibidos y enviados con el contacto", () => {
    const [inbound] = matchMessage(msg("Ana <ana@colegio.mx>", "yo@e2.mx"), "yo@e2.mx", contacts);
    expect(inbound).toMatchObject({ direction: "inbound", contact_id: "c1", institution_id: "i1", subject: "Propuesta" });
    const [outbound] = matchMessage(msg("yo@e2.mx", "ana@colegio.mx"), "YO@e2.mx", contacts);
    expect(outbound.direction).toBe("outbound");
  });

  it("ignora correos sin contactos del CRM", () => {
    expect(matchMessage(msg("x@otro.com", "yo@e2.mx"), "yo@e2.mx", contacts)).toEqual([]);
  });

  it("busca desde la última sincronización, máximo 30 días atrás", () => {
    const now = new Date("2027-01-10T00:00:00Z");
    expect(gmailQuery(null, now)).toBe("newer_than:30d -in:chats");
    expect(gmailQuery("2027-01-09T12:00:00Z", now)).toBe(`after:${Date.parse("2027-01-09T11:00:00Z") / 1000} -in:chats`);
    expect(gmailQuery("2026-01-01T00:00:00Z", now)).toBe(`after:${Date.parse("2026-12-11T00:00:00Z") / 1000} -in:chats`);
  });
});
