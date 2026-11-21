"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { whatsappAccountSchema } from "./schemas";

// El token de verificación se genera aquí y se muestra una sola vez: la base no lo devuelve.
export async function saveWhatsappAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = whatsappAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const token = randomBytes(24).toString("base64url");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_whatsapp_account", {
    p_phone_number_id: parsed.data.phone_number_id, p_display_phone: parsed.data.display_phone,
    p_app_secret: parsed.data.app_secret, p_verify_token: token,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/integraciones");
  return { success: `Número guardado. Token de verificación para Meta (cópialo ahora, no se vuelve a mostrar): ${token}` };
}

export async function removeWhatsappAccount(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("whatsapp_accounts").delete().eq("id", id);
  revalidatePath("/integraciones");
}
