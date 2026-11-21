"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { GRAPH_URL, whatsappEnv } from "./config";
import { consentSchema, graphPayload, sendSchema, templateSchema, whatsappAccountSchema } from "./schemas";

// El token de verificación se genera aquí y se muestra una sola vez: la base no lo devuelve.
export async function saveWhatsappAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = whatsappAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const token = randomBytes(24).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_whatsapp_account", {
    p_phone_number_id: parsed.data.phone_number_id, p_display_phone: parsed.data.display_phone,
    p_app_secret: parsed.data.app_secret, p_verify_token: token,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/integraciones");
  return { success: `Número guardado. Token de verificación para Meta (cópialo ahora, no se vuelve a mostrar): ${token}` };
}

export async function removeWhatsappAccount(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("whatsapp_accounts").delete().eq("id", id);
  revalidatePath("/integraciones");
}

// Las reglas (consentimiento, ventana de 24 h, plantillas) las aplica whatsapp_prepare_send en la base.
export async function sendWhatsapp(institutionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const env = whatsappEnv();
  if (!env) return { error: "Falta el token de WhatsApp en el servidor (ver README, WhatsApp)." };
  const parsed = sendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: prep, error } = await supabase.rpc("whatsapp_prepare_send", {
    p_institution: institutionId, p_contact: parsed.data.contact_id, p_template: parsed.data.template_id, p_text: parsed.data.text || null,
  });
  if (error) return { error: dbErrorMessage(error) };

  let wamid: string | null = null;
  let failure: string | null = null;
  try {
    const res = await fetch(`${GRAPH_URL}/${prep.phone_number_id}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(graphPayload(prep)),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    wamid = body.messages?.[0]?.id ?? null;
    if (!wamid) failure = body.error?.message ?? `Meta respondió ${res.status}`;
  } catch {
    failure = "No se pudo contactar a WhatsApp.";
  }
  await supabase.rpc("whatsapp_mark_sent", { p_id: prep.id, p_wamid: wamid, p_error: failure });
  revalidatePath(`/instituciones/${institutionId}`);
  return failure ? { error: `No se envió: ${failure}` } : { success: "Mensaje enviado." };
}

export async function setConsent(institutionId: string, contactId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = consentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts")
    .update({ ...parsed.data, consent_updated_at: new Date().toISOString() }).eq("id", contactId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar este contacto." };
  revalidatePath(`/instituciones/${institutionId}`);
  return { success: parsed.data.consent_status === "granted" ? "Consentimiento registrado." : "Contacto marcado como no contactar." };
}

export async function createTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  const { error } = await supabase.from("whatsapp_templates").insert({ ...parsed.data, organization_id: orgId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/integraciones");
  return { success: "Plantilla agregada." };
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("whatsapp_templates").delete().eq("id", id);
  revalidatePath("/integraciones");
}
