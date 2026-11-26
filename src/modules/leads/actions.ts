"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { leadStatuses } from "./labels";

const updateSchema = z.object({
  status: z.enum(Object.keys(leadStatuses) as [keyof typeof leadStatuses], "Estatus no válido"),
  notes: z.string().trim().max(4000, "Máximo 4000 caracteres").transform((v) => v || null),
});

export async function updateLead(leadId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update(parsed.data).eq("id", leadId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar este prospecto." };
  revalidatePath("/prospectos");
  return { success: "Cambios guardados." };
}
