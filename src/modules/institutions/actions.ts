"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { linkContact } from "./contacts";
import { branchSchema, contactSchema, institutionSchema } from "./schemas";

async function context() {
  const supabase = await createClient();
  const [{ data: orgId }, { data: profileId }] = await Promise.all([
    supabase.rpc("current_org_id"),
    supabase.rpc("current_profile_id"),
  ]);
  return { supabase, orgId: orgId as string | null, profileId: profileId as string | null };
}

const firstIssue = (e: { issues: { message: string }[] }) => ({ error: e.issues[0].message });

// Campos "contact_*" del alta -> contacto principal (opcional).
function contactFromForm(formData: FormData) {
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => k.startsWith("contact_")).map(([k, val]) => [k.slice(8), val]));
  if (!Object.values(raw).some((x) => String(x).trim())) return null;
  return contactSchema.safeParse({ ...raw, is_primary: true });
}

export async function createInstitution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = institutionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return firstIssue(parsed.error);
  const contact = contactFromForm(formData);
  if (contact && !contact.success) return { error: `Contacto principal: ${contact.error.issues[0].message}` };
  const { supabase, orgId, profileId } = await context();
  if (!orgId || !profileId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  if (formData.get("confirm_duplicates") !== "on") {
    const { data: dups } = await supabase.rpc("find_institution_duplicates", {
      p_name: parsed.data.name,
      p_website: parsed.data.website ?? null,
      p_phone: parsed.data.phone ?? null,
      p_tax_id: parsed.data.tax_id ?? null,
    });
    if (dups?.length) {
      return {
        error: "Puede que esta institución ya exista. Revisa y, si es otra, marca “Crear aunque parezca duplicada”.",
        details: dups.map(
          (d: { name: string; city: string | null; owner_name: string | null; reason: string }) =>
            `${d.name}${d.city ? `, ${d.city}` : ""} (${d.reason}${d.owner_name ? `; responsable: ${d.owner_name}` : ""})`,
        ),
      };
    }
  }

  const { data, error } = await supabase
    .from("institutions")
    .insert({ ...parsed.data, owner_id: parsed.data.owner_id ?? profileId, organization_id: orgId, created_by: profileId })
    .select("id")
    .single();
  if (error) return { error: dbErrorMessage(error) };
  if (contact?.success) {
    const { job_title, department, decision_role, is_primary, ...person } = contact.data;
    // Si falla el contacto la institución ya existe: se avisa en el expediente en lugar de perder el alta.
    const res = await linkContact(supabase, orgId, profileId, data.id, person, { job_title, department, decision_role, is_primary });
    if (res.error) redirect(`/instituciones/${data.id}?aviso=contacto`);
  }
  revalidatePath("/instituciones");
  redirect(`/instituciones/${data.id}`);
}

export async function updateInstitution(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = institutionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return firstIssue(parsed.error);
  if (parsed.data.parent_institution_id === id) return { error: "Una institución no puede ser su propio grupo." };
  const { supabase } = await context();
  const { owner_id, ...changes } = parsed.data;
  const { data, error } = await supabase
    .from("institutions")
    .update(owner_id ? { ...changes, owner_id } : changes) // sin responsable elegido se conserva el actual
    .eq("id", id)
    .select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "No tienes permiso para editar esta institución." };
  revalidatePath(`/instituciones/${id}`);
  return { success: "Cambios guardados." };
}

export async function addContact(institutionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return firstIssue(parsed.error);
  const { supabase, orgId, profileId } = await context();
  if (!orgId || !profileId) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { job_title, department, decision_role, is_primary, ...person } = parsed.data;

  const result = await linkContact(supabase, orgId, profileId, institutionId, person, { job_title, department, decision_role, is_primary });
  if (result.error) return result;
  revalidatePath(`/instituciones/${institutionId}`);
  revalidatePath("/contactos");
  return { success: result.reused ? "Ese correo ya existía: se vinculó el contacto existente." : "Contacto agregado." };
}

export async function addBranch(institutionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = branchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return firstIssue(parsed.error);
  const { supabase, orgId } = await context();
  const { error } = await supabase.from("institution_branches").insert({ ...parsed.data, organization_id: orgId, institution_id: institutionId });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(`/instituciones/${institutionId}`);
  return { success: "Sucursal agregada." };
}
