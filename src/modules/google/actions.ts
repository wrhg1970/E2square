"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { googleClient } from "./api";
import { googleEnv } from "./config";
import { gmailQuery, matchMessage } from "./gmail";

const notConfigured = { error: "La integración con Google aún no está configurada." };
const failed = (e: unknown) => ({ error: e instanceof Error ? e.message : "No se pudo hablar con Google. Intenta de nuevo." });

export async function syncGmail(): Promise<ActionState> {
  const env = googleEnv();
  if (!env) return notConfigured;
  const supabase = await createClient();
  try {
    const g = await googleClient(env, supabase);
    if (!g) return { error: "Primero conecta tu cuenta de Google." };
    const [{ data: me }, { data: orgId }, contacts, links] = await Promise.all([
      supabase.rpc("current_profile_id"),
      supabase.rpc("current_org_id"),
      // shortcut: carga todos los contactos visibles con correo; filtrar por dominio si pasan de ~20 mil.
      supabase.from("contacts").select("id, email").not("email", "is", null),
      supabase.from("institution_contacts").select("contact_id, institution_id, is_primary"),
    ]);
    const instOf = new Map<string, string>();
    for (const l of (links.data ?? []).sort((a, b) => Number(a.is_primary) - Number(b.is_primary))) instOf.set(l.contact_id, l.institution_id);
    const byEmail = new Map((contacts.data ?? []).map((c) => [c.email as string, { contact_id: c.id, institution_id: instOf.get(c.id) ?? null }]));

    const startedAt = new Date().toISOString();
    // shortcut: hasta 100 correos por sincronización; repetir el botón trae los siguientes por fecha.
    const ids = await g.listMessageIds(gmailQuery(g.conn.last_sync_at));
    const rows = [];
    for (let i = 0; i < ids.length; i += 10) {
      const batch = await Promise.all(ids.slice(i, i + 10).map(g.getMessage));
      rows.push(...batch.flatMap((m) => matchMessage(m, g.conn.google_email, byEmail)));
    }
    if (rows.length) {
      const { error } = await supabase.from("communications")
        .upsert(rows.map((r) => ({ ...r, organization_id: orgId, owner_id: me })), { onConflict: "owner_id,external_id,contact_id", ignoreDuplicates: true });
      if (error) return { error: dbErrorMessage(error) };
    }
    await supabase.from("google_connections").update({ last_sync_at: startedAt }).eq("id", g.conn.id);
    revalidatePath("/integraciones");
    return { success: `Revisé ${ids.length} correos; ${rows.length} con contactos del CRM quedaron registrados.` };
  } catch (e) {
    return failed(e);
  }
}

export async function disconnectGoogle(): Promise<ActionState> {
  const supabase = await createClient();
  const { data: me } = await supabase.rpc("current_profile_id");
  const { error } = await supabase.from("google_connections").delete().eq("profile_id", me);
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/integraciones");
  return { success: "Cuenta desconectada. Los correos ya registrados se conservan." };
}

export async function addActivityToCalendar(activityId: string): Promise<ActionState> {
  const env = googleEnv();
  if (!env) return notConfigured;
  const supabase = await createClient();
  const { data: a } = await supabase.from("activities")
    .select("id, subject, notes, due_at, timezone, google_event_id, institution_id, opportunity_id").eq("id", activityId).maybeSingle();
  if (!a) return { error: "La actividad no existe." };
  if (!a.due_at) return { error: "La actividad no tiene fecha y hora." };
  if (a.google_event_id) return { success: "Ya está en tu Google Calendar." };
  try {
    const g = await googleClient(env, supabase);
    if (!g) return { error: "Primero conecta tu cuenta de Google en Integraciones." };
    const start = new Date(a.due_at);
    const event = await g.createEvent({
      summary: a.subject,
      description: a.notes ?? undefined,
      start: { dateTime: start.toISOString(), timeZone: a.timezone },
      end: { dateTime: new Date(start.getTime() + 30 * 60_000).toISOString(), timeZone: a.timezone },
    });
    const { error } = await supabase.from("activities").update({ google_event_id: event.id }).eq("id", a.id);
    if (error) return { error: dbErrorMessage(error) };
    if (a.opportunity_id) revalidatePath(`/oportunidades/${a.opportunity_id}`);
    if (a.institution_id) revalidatePath(`/instituciones/${a.institution_id}`);
    return { success: "Agregada a tu Google Calendar." };
  } catch (e) {
    return failed(e);
  }
}
