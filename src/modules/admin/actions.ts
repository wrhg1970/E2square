"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { CURRENCIES } from "@/modules/catalog/labels";
import { scoreWeightsSchema } from "@/modules/institutions/scoring";
import { automationSchema, businessUnitSchema, companySchema, exchangeRateSchema, invitationSchema, officeSchema } from "./schemas";

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

export async function updateOrgSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const currency = String(formData.get("reporting_currency"));
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { error: "Elige una moneda de reporte." };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  const { data, error } = await supabase
    .from("organizations")
    .update({ require_next_activity: formData.get("require_next_activity") === "on", reporting_currency: currency })
    .eq("id", orgId)
    .select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar la configuración." };
  revalidatePath("/administracion");
  return { success: "Configuración guardada." };
}

export async function updateScoreWeights(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scoreWeightsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  const { data, error } = await supabase.from("organizations").update({ score_weights: parsed.data }).eq("id", orgId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar la configuración." };
  revalidatePath("/administracion");
  return { success: "Pesos del puntaje guardados." };
}

export async function saveAutomation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = automationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  if (!orgId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase
    .from("automation_rules")
    .upsert({ ...parsed.data, organization_id: orgId }, { onConflict: "organization_id,key" });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/administracion");
  return { success: parsed.data.enabled ? "Regla activada." : "Regla desactivada." };
}

export async function addExchangeRate(_prev: ActionState, formData: FormData) {
  return insertInto("exchange_rates", exchangeRateSchema, formData, "Tipo de cambio guardado.");
}

// ===== Usuarios: rol, estado y ámbitos. RLS exige admin.users; la base impide auto-bloquearse. =====
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const SCOPE_TYPES = ["organization", "company", "business_unit", "office", "territory"] as const;

export async function setUserRole(profileId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const roleId = formData.get("role_id");
  if (!isUuid(profileId) || !isUuid(roleId)) return { error: "Elige un rol." };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  // Primero el rol nuevo y luego se quitan los demás: nunca queda sin rol si algo falla.
  const ins = await supabase.from("profile_roles").upsert({ organization_id: orgId, profile_id: profileId, role_id: roleId }, { onConflict: "profile_id,role_id", ignoreDuplicates: true });
  if (ins.error) return { error: dbErrorMessage(ins.error) };
  const del = await supabase.from("profile_roles").delete().eq("profile_id", profileId).neq("role_id", roleId);
  if (del.error) return { error: dbErrorMessage(del.error) };
  revalidatePath(`/administracion/usuarios/${profileId}`);
  return { success: "Rol actualizado." };
}

export async function setUserStatus(profileId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const status = formData.get("status");
  if (!isUuid(profileId) || (status !== "active" && status !== "inactive")) return { error: "Estado no válido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ status }).eq("id", profileId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar usuarios." };
  revalidatePath(`/administracion/usuarios/${profileId}`);
  return { success: status === "active" ? "Usuario reactivado." : "Usuario desactivado: ya no puede entrar." };
}

// El valor llega como "tipo:id" desde un solo selector.
export async function addUserScope(profileId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const [type, id] = String(formData.get("scope") ?? "").split(":");
  if (!isUuid(profileId) || !(SCOPE_TYPES as readonly string[]).includes(type) || !isUuid(id)) return { error: "Elige un ámbito." };
  const supabase = await createClient();
  const { data: orgId } = await supabase.rpc("current_org_id");
  const { error } = await supabase.from("user_scopes").insert({ organization_id: orgId, profile_id: profileId, scope_type: type, scope_id: id });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/administracion/usuarios/${profileId}`);
  return { success: "Ámbito agregado." };
}

export async function removeUserScope(formData: FormData) {
  const id = formData.get("id"), profileId = formData.get("profile_id");
  if (!isUuid(id) || !isUuid(profileId)) return;
  const supabase = await createClient();
  await supabase.from("user_scopes").delete().eq("id", id);
  revalidatePath(`/administracion/usuarios/${profileId}`);
}
