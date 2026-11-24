"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { campaignSchema, costSchema, segmentSchema, stepSchema } from "./schemas";

export async function createCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { source_id, start_date, ...fields } = parsed.data;
  const supabase = await createClient();
  const [{ data: org }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
  if (!org || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  // Al copiar se traen la secuencia y el segmento; nunca audiencia, resultados, tareas ni costo real.
  let steps: { day_offset: number; activity_type: string; subject: string }[] = [];
  let segment = {};
  if (source_id) {
    const [{ data: src }, { data: srcSteps }] = await Promise.all([
      supabase.from("campaigns").select("segment").eq("id", source_id).maybeSingle(),
      supabase.from("campaign_steps").select("day_offset, activity_type, subject").eq("campaign_id", source_id).order("day_offset").order("created_at"),
    ]);
    if (!src) return { error: "No se encontró la campaña de origen." };
    steps = srcSteps ?? [];
    if (!fields.is_template) segment = src.segment ?? {};
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const { data, error } = await supabase.from("campaigns")
    .insert({ ...fields, start_date: start_date ?? today, segment, organization_id: org, owner_id: me, created_by: me }).select("id").single();
  if (error) return { error: dbErrorMessage(error) };
  if (steps.length) {
    const { error: stepsError } = await supabase.from("campaign_steps")
      .insert(steps.map((st) => ({ ...st, campaign_id: data.id, organization_id: org })));
    if (stepsError) {
      await supabase.from("campaigns").delete().eq("id", data.id); // no dejar una copia a medias
      return { error: `No se pudo copiar la secuencia: ${dbErrorMessage(stepsError)}` };
    }
  }
  redirect(`/campanas/${data.id}`);
}

export async function deleteTemplate(templateId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", templateId).eq("is_template", true);
  if (error) redirect(`/campanas/${templateId}?error=borrar`);
  redirect("/campanas?estatus=plantillas");
}

export async function addMembers(campaignId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = segmentSchema.safeParse({ ...Object.fromEntries(formData), types: formData.getAll("types") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_campaign_members", {
    p_campaign: campaignId, p_country: parsed.data.country ?? null, p_types: parsed.data.types,
    p_owner: parsed.data.owner ?? null, p_status: parsed.data.status ?? null,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/campanas/${campaignId}`);
  return { success: data === 0 ? "Ninguna institución nueva cumple el segmento." : `Se agregaron ${data} instituciones.` };
}

export async function launchCampaign(campaignId: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("launch_campaign", { p_campaign: campaignId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/campanas/${campaignId}`);
  return { success: `Campaña lanzada: ${data} tareas asignadas a los responsables.` };
}

export async function updateCost(campaignId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").update(parsed.data).eq("id", campaignId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar campañas." };
  revalidatePath(`/campanas/${campaignId}`);
  return { success: "Cambios guardados." };
}

export async function closeCampaign(campaignId: string, status: "finished" | "cancelled") {
  const supabase = await createClient();
  await supabase.from("campaigns").update({ status }).eq("id", campaignId);
  revalidatePath(`/campanas/${campaignId}`);
}

export async function removeMember(campaignId: string, memberId: string) {
  const supabase = await createClient();
  await supabase.from("campaign_members").delete().eq("id", memberId);
  revalidatePath(`/campanas/${campaignId}`);
}

export async function addStep(campaignId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = stepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("current_org_id");
  const { error } = await supabase.from("campaign_steps").insert({ ...parsed.data, campaign_id: campaignId, organization_id: org });
  if (error) return { error: error.code === "42501" ? "Solo se editan los pasos de una campaña en borrador (máximo 10)." : dbErrorMessage(error) };
  revalidatePath(`/campanas/${campaignId}`);
  return { success: "Paso agregado." };
}

export async function removeStep(campaignId: string, stepId: string) {
  const supabase = await createClient();
  await supabase.from("campaign_steps").delete().eq("id", stepId);
  revalidatePath(`/campanas/${campaignId}`);
}
