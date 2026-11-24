"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { nextPeriod } from "./period";
import { goalSchema, parseSplit } from "./schemas";

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

// Copia la meta (mismo alcance y objetivo) al periodo siguiente.
export async function repeatGoal(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const [{ data: g }, { data: me }] = await Promise.all([
    supabase.from("goals").select("organization_id, name, metric, period_start, period_end, target, currency_code, owner_id, office_id, product_id, company_id, business_unit_id, team_id").eq("id", id).maybeSingle(),
    supabase.rpc("current_profile_id"),
  ]);
  if (!g) return;
  const next = nextPeriod(g.period_start, g.period_end);
  await supabase.from("goals").insert({ ...g, period_start: next.start, period_end: next.end, created_by: me });
  revalidatePath("/metas");
  revalidatePath("/");
}

export async function splitGoal(goalId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseSplit(formData.getAll("owner").map(String), (id) => formData.get(`target_${id}`) as string | null);
  if ("error" in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("split_goal", { p_goal: goalId, p_owners: parsed.owners, p_targets: parsed.targets ?? undefined });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/metas");
  revalidatePath("/");
  return { success: `Meta repartida entre ${data} vendedores.` };
}
