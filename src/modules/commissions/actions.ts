"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { decisionSchema, rateSchema } from "./schemas";

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
