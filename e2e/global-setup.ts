import { readFileSync } from "node:fs";

export const E2E_USER = { email: "admin@e2square.test", password: "Prueba-E2E-2027" };

// Crea (o reutiliza) el usuario del seed en Supabase Auth local con la llave service_role local.
export default async function globalSetup() {
  const env = Object.fromEntries(
    (() => { try { return readFileSync(".env.local", "utf8"); } catch { return ""; } })()
      .split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("Las pruebas E2E solo corren contra Supabase local.");
  if (!key) throw new Error("Define SUPABASE_SERVICE_ROLE_KEY con la llave service_role que muestra `npx supabase status`.");
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...E2E_USER, email_confirm: true }),
  });
  if (!res.ok && res.status !== 422) throw new Error(`No se pudo crear el usuario E2E: ${res.status} ${await res.text()}`);
}
