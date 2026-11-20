"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { itemSchema, opportunitySchema, opportunityUpdateSchema, stageChangeSchema } from "./schemas";

const refresh = (id: string, institutionId?: string) => {
  revalidatePath(`/oportunidades/${id}`);
  revalidatePath("/oportunidades");
  if (institutionId) revalidatePath(`/instituciones/${institutionId}`);
};

export async function createOpportunity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = opportunitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const [{ data: org }, { data: me }, { data: first }] = await Promise.all([
    supabase.rpc("current_org_id"),
    supabase.rpc("current_profile_id"),
    supabase.from("pipeline_stages").select("id").eq("pipeline_id", parsed.data.pipeline_id).order("sort_order").limit(1).maybeSingle(),
  ]);
  if (!org || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (!first) return { error: "Ese producto no tiene etapas configuradas." };

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      ...parsed.data,
      owner_id: parsed.data.owner_id ?? me,
      stage_id: first.id,
      probability: 0, // la base la toma de la etapa
      organization_id: org,
      created_by: me,
    })
    .select("id")
    .single();
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/instituciones/${parsed.data.institution_id}`);
  redirect(`/oportunidades/${data.id}`);
}

export async function updateOpportunity(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = opportunityUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { owner_id, ...changes } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update(owner_id ? { ...changes, owner_id } : changes)
    .eq("id", id)
    .select("id, institution_id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar esta oportunidad." };
  refresh(id, data[0].institution_id);
  return { success: "Cambios guardados." };
}

export async function changeStage(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = stageChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage_id: parsed.data.stage_id, ...(parsed.data.loss_reason ? { loss_reason: parsed.data.loss_reason } : {}) })
    .eq("id", id)
    .select("id, institution_id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para mover esta oportunidad." };
  refresh(id, data[0].institution_id);
  return { success: "Etapa actualizada." };
}

export async function setCancelled(id: string, cancelled: boolean) {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").update({ status: cancelled ? "cancelled" : "open", closed_at: null }).eq("id", id).select("institution_id");
  refresh(id, data?.[0]?.institution_id);
}

export async function addItem(opportunityId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("current_org_id");
  const { error } = await supabase.from("opportunity_items").insert({ ...parsed.data, organization_id: org, opportunity_id: opportunityId });
  if (error) return { error: dbErrorMessage(error) };
  refresh(opportunityId);
  return { success: "Producto agregado." };
}

export async function removeItem(opportunityId: string, itemId: string) {
  const supabase = await createClient();
  await supabase.from("opportunity_items").delete().eq("id", itemId);
  refresh(opportunityId);
}
