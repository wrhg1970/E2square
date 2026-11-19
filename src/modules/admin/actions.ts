"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { businessUnitSchema, companySchema, invitationSchema, officeSchema } from "./schemas";

// La autorización real la aplica RLS en la base; aquí solo validamos y traducimos errores.
async function insertInto(table: string, schema: z.ZodType, formData: FormData, success: string): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  if (!orgId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase.from(table).insert({ ...(parsed.data as object), organization_id: orgId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/administracion");
  return { success };
}

export async function createCompany(_prev: ActionState, formData: FormData) {
  return insertInto("companies", companySchema, formData, "Empresa creada.");
}

export async function createBusinessUnit(_prev: ActionState, formData: FormData) {
  return insertInto("business_units", businessUnitSchema, formData, "Unidad creada.");
}

export async function createOffice(_prev: ActionState, formData: FormData) {
  return insertInto("offices", officeSchema, formData, "Oficina creada.");
}

export async function createInvitation(_prev: ActionState, formData: FormData) {
  return insertInto(
    "invitations",
    invitationSchema,
    formData,
    "Invitación registrada. Ahora crea el usuario en Supabase (Authentication > Add user) con ese correo.",
  );
}
