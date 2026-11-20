"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { goalSchema } from "./schemas";

export async function createGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const [{ data: orgId }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
  if (!orgId || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase.from("goals").insert({ ...parsed.data, organization_id: orgId, created_by: me });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/metas");
  revalidatePath("/");
  return { success: "Meta creada." };
}

export async function deleteGoal(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("goals").delete().eq("id", String(formData.get("id")));
  revalidatePath("/metas");
}
