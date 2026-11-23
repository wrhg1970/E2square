"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { campaignSchema, costSchema, segmentSchema } from "./schemas";

export async function createCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = campaignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const [{ data: org }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
  if (!org || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { data, error } = await supabase.from("campaigns")
    .insert({ ...parsed.data, organization_id: org, owner_id: me, created_by: me }).select("id").single();
  if (error) return { error: dbErrorMessage(error) };
  redirect(`/campanas/${data.id}`);
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
  return { success: `Campaña lanzada: ${data} tareas de seguimiento asignadas a los responsables.` };
}

export async function updateCost(campaignId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").update(parsed.data).eq("id", campaignId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar campañas." };
  revalidatePath(`/campanas/${campaignId}`);
  return { success: "Costo actualizado." };
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
