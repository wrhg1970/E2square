"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { leadStatuses } from "./labels";
import { bulkSchema, notesSchema, statusSchema } from "./schemas";

// Cambio de estatus de un clic: el botón que se presiona trae el estatus nuevo.
export async function setLeadStatus(leadId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse(formData.get("status"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update({ status: parsed.data }).eq("id", leadId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar este prospecto." };
  revalidatePath("/prospectos");
  return { success: `Ahora está en ${leadStatuses[parsed.data]}.` };
}

export async function updateLeadNotes(leadId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = notesSchema.safeParse({ notes: formData.get("notes") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update(parsed.data).eq("id", leadId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar este prospecto." };
  revalidatePath("/prospectos");
  return { success: "Notas guardadas." };
}

// Acciones sobre varios prospectos a la vez. La base solo toca los que la persona puede editar (o borrar).
export async function bulkLeads(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = bulkSchema.safeParse({ op: formData.get("op"), status: formData.get("status") || undefined, ids: formData.getAll("ids") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { op, ids } = parsed.data;
  const supabase = await createClient();
  const table = supabase.from("leads");
  const { data, error } = await (op === "delete" ? table.delete()
    : table.update(op === "status" ? { status: parsed.data.status } : { archived_at: op === "archive" ? new Date().toISOString() : null })
  ).in("id", ids).select("id");
  if (error) return { error: dbErrorMessage(error) };
  const n = data?.length ?? 0;
  if (!n) return { error: "No tienes permiso para cambiar estos prospectos." };
  revalidatePath("/prospectos");
  const verb = { status: "actualizado", archive: "archivado", unarchive: "devuelto a la lista", delete: "borrado" }[op];
  const done = n === 1 ? `1 prospecto ${verb}` : `${n} prospectos ${verb.replace(/^(\S+)o/, "$1os")}`;
  const skipped = ids.length - n;
  return { success: `${done}${skipped ? `; ${skipped} sin permiso` : ""}.` };
}
