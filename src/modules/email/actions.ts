"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { googleClient } from "@/modules/google/api";
import { googleEnv } from "@/modules/google/config";
import { buildRawEmail } from "@/modules/google/gmail";
import { sendSchema, templateSchema } from "./templates";

const noPermission = "Solo quien creó la plantilla, administración, dirección o marketing pueden cambiarla.";

export async function createTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const [{ data: org }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
  if (!org || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase.from("email_templates").insert({ ...parsed.data, organization_id: org, created_by: me });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/correos");
  return { success: "Plantilla creada." };
}

export async function updateTemplate(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").update(parsed.data).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: noPermission };
  revalidatePath("/correos");
  return { success: "Cambios guardados." };
}

export async function duplicateTemplate(id: string) {
  const supabase = await createClient();
  const [{ data: t }, { data: org }, { data: me }] = await Promise.all([
    supabase.from("email_templates").select("category, title, subject, body").eq("id", id).maybeSingle(),
    supabase.rpc("current_org_id"), supabase.rpc("current_profile_id"),
  ]);
  if (!t || !org || !me) return;
  await supabase.from("email_templates").insert({ ...t, title: `${t.title} (copia)`.slice(0, 200), organization_id: org, created_by: me });
  revalidatePath("/correos");
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  await supabase.from("email_templates").delete().eq("id", id);
  revalidatePath("/correos");
}

// Envía desde el Gmail del usuario y lo deja en el registro de correos de la institución.
export async function sendEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const env = googleEnv();
  if (!env) return { error: "El envío desde el CRM aún no está activo. Usa «Abrir en Gmail»." };
  const { to, subject, body, institution_id, contact_id, template_id } = parsed.data;
  const supabase = await createClient();
  try {
    const g = await googleClient(env, supabase);
    if (!g) return { error: "Primero conecta tu cuenta de Google en Integraciones." };
    const sent = await g.sendMessage(buildRawEmail(to, subject, body));
    const [{ data: org }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
    // Si falla el registro el correo ya salió; la siguiente sincronización de Gmail lo vuelve a traer.
    const row = {
      organization_id: org, owner_id: me, channel: "email", direction: "outbound", external_id: sent.id, thread_id: sent.threadId,
      subject: subject.slice(0, 500), snippet: body.slice(0, 500), from_email: g.conn.google_email, to_emails: [to],
      sent_at: new Date().toISOString(), contact_id, institution_id, status: "sent",
    };
    const { error } = await supabase.from("communications").insert({ ...row, sent_from_crm: true, template_id });
    // shortcut: sin la migración 20261218 se guarda sin plantilla; quitar cuando esté aplicada en todos lados.
    if (error) await supabase.from("communications").insert(row);
    revalidatePath("/correos");
    if (institution_id) revalidatePath(`/instituciones/${institution_id}`);
    return { success: `Enviado a ${to} desde ${g.conn.google_email}.` };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 403) return { error: "Google no dio permiso para enviar. Desconecta y vuelve a conectar tu cuenta en Integraciones." };
    return { error: e instanceof Error ? e.message : "No se pudo enviar. Intenta de nuevo." };
  }
}
