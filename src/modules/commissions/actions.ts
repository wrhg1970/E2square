"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { decisionSchema, rateSchema, settingsSchema, splitSchema } from "./schemas";

export async function saveRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = rateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  if (!orgId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase
    .from("commission_rates")
    .upsert({ ...parsed.data, organization_id: orgId }, { onConflict: "profile_id,product_id" });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/comisiones");
  return { success: "Porcentaje guardado. Aplica a las ventas que se ganen desde ahora." };
}

export async function deleteRate(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("commission_rates").delete().eq("id", String(formData.get("id")));
  revalidatePath("/comisiones");
}

export async function decideCommission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_commission", { p_id: parsed.data.id, p_status: parsed.data.status, p_note: parsed.data.note });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/comisiones");
  return { success: "Listo." };
}

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  if (!orgId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase.from("commission_settings").upsert({ ...parsed.data, organization_id: orgId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/comisiones");
  return { success: "Esquemas guardados. Aplican a las ventas que se ganen desde ahora." };
}

export async function closeGoalTier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get("goal_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Elige una meta." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_goal_tier", { p_goal: id });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/comisiones");
  return { success: `Escalón calculado: ${data}. Quedó pendiente de aprobar.` };
}

export async function addSplit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = splitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  if (!orgId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase.from("opportunity_splits").insert({ ...parsed.data, organization_id: orgId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/oportunidades/${parsed.data.opportunity_id}`);
  return { success: "Reparto guardado." };
}

export async function removeSplit(opportunityId: string, splitId: string) {
  const supabase = await createClient();
  await supabase.from("opportunity_splits").delete().eq("id", splitId);
  revalidatePath(`/oportunidades/${opportunityId}`);
}

export async function setCollected(opportunityId: string, collected: boolean): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_opportunity_collected", { p_opportunity: opportunityId, p_collected: collected });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/oportunidades/${opportunityId}`);
  revalidatePath("/comisiones");
  return { success: collected ? "Pago del cliente registrado." : "Pago del cliente quitado." };
}
