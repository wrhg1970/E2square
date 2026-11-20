"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { activitySchema, completeSchema } from "./schemas";
import { zonedToUtc } from "./time";

async function me() {
  const supabase = await createClient();
  const { data: id } = await supabase.rpc("current_profile_id");
  const { data: profile } = id
    ? await supabase.from("profiles").select("id, organization_id, timezone").eq("id", id).maybeSingle()
    : { data: null };
  return { supabase, profile };
}

function refreshFor(a: { institution_id?: string | null; opportunity_id?: string | null }) {
  revalidatePath("/mi-dia");
  if (a.institution_id) revalidatePath(`/instituciones/${a.institution_id}`);
  if (a.opportunity_id) revalidatePath(`/oportunidades/${a.opportunity_id}`);
}

export async function createActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { due_local, done, reminder, ...rest } = parsed.data;
  if (!done && !due_local) return { error: "Indica la fecha y hora, o marca que ya se realizó." };
  const { supabase, profile } = await me();
  if (!profile) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { error } = await supabase.from("activities").insert({
    ...rest,
    organization_id: profile.organization_id,
    owner_id: profile.id,
    created_by: profile.id,
    timezone: profile.timezone,
    due_at: due_local ? zonedToUtc(due_local, profile.timezone).toISOString() : new Date().toISOString(),
    reminder_at: !done && due_local && reminder != null
      ? new Date(zonedToUtc(due_local, profile.timezone).getTime() - Number(reminder) * 60_000).toISOString()
      : null,
    status: done ? "done" : "pending",
  });
  if (error) return { error: dbErrorMessage(error) };
  refreshFor(rest);
  return { success: done ? "Actividad registrada." : "Actividad programada." };
}

// Completa una actividad; si se indica, programa primero la siguiente (así cumple la regla de higiene).
export async function completeActivity(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = completeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, profile } = await me();
  if (!profile) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { data: current } = await supabase.from("activities").select("institution_id, opportunity_id, contact_id").eq("id", id).maybeSingle();
  if (!current) return { error: "No encontramos esa actividad." };

  const { next_subject, next_type, next_due_local, outcome } = parsed.data;
  if (next_subject || next_due_local) {
    if (!next_subject || !next_due_local) return { error: "Para la siguiente actividad indica asunto y fecha." };
    const { error } = await supabase.from("activities").insert({
      activity_type: next_type ?? "follow_up",
      subject: next_subject,
      institution_id: current.institution_id,
      opportunity_id: current.opportunity_id,
      contact_id: current.contact_id,
      organization_id: profile.organization_id,
      owner_id: profile.id,
      created_by: profile.id,
      timezone: profile.timezone,
      due_at: zonedToUtc(next_due_local, profile.timezone).toISOString(),
    });
    if (error) return { error: dbErrorMessage(error) };
  }

  const { data, error } = await supabase.from("activities").update({ status: "done", outcome }).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para cerrar esta actividad." };
  refreshFor(current);
  return { success: "Actividad completada." };
}

export async function cancelActivity(id: string) {
  const { supabase } = await me();
  const { data } = await supabase.from("activities").update({ status: "cancelled" }).eq("id", id).select("institution_id, opportunity_id");
  if (data?.[0]) refreshFor(data[0]);
}
