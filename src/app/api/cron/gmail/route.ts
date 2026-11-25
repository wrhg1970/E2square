import { createClient } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { fetchCommunications, googleApi, type GoogleConnection } from "@/modules/google/api";
import { googleEnv } from "@/modules/google/config";

// Tarea nocturna de Vercel Cron: Vercel manda "Authorization: Bearer <CRON_SECRET>".
// Sin service_role: la base valida esa clave (generada en Integraciones) y procesa a cada usuario con sus permisos.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const key = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (key.length < 32) return new Response("Unauthorized", { status: 401 });
  const env = googleEnv();
  if (!env) return Response.json({ skipped: "Google no está configurado" });
  const pub = publicEnv();
  const db = createClient(pub.NEXT_PUBLIC_SUPABASE_URL, pub.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const { data: conns, error } = await db.rpc("cron_gmail_connections", { p_key: key });
  if (error) return new Response("Error", { status: 500 });
  if (!conns?.length) return new Response("Unauthorized", { status: 401 });

  const results = [];
  // shortcut: un usuario tras otro; con más de ~50 conexiones conviene repartir en varias corridas.
  for (const conn of conns as GoogleConnection[]) {
    try {
      const startedAt = new Date().toISOString();
      const { data: contacts, error: e1 } = await db.rpc("cron_gmail_contacts", { p_key: key, p_connection: conn.id });
      if (e1) throw new Error(e1.message);
      const byEmail = new Map((contacts as { email: string; contact_id: string; institution_id: string | null }[])
        .map((c) => [c.email, { contact_id: c.contact_id, institution_id: c.institution_id }]));
      const { checked, rows } = await fetchCommunications(await googleApi(env, conn), byEmail);
      const { data: saved, error: e2 } = await db.rpc("cron_gmail_save", { p_key: key, p_connection: conn.id, p_rows: rows, p_started_at: startedAt });
      if (e2) throw new Error(e2.message);
      results.push({ connection: conn.id, checked, saved });
    } catch (e) {
      // Una cuenta con el permiso revocado no detiene a las demás.
      results.push({ connection: conn.id, error: e instanceof Error ? e.message : "error" });
    }
  }
  return Response.json({ results });
}
