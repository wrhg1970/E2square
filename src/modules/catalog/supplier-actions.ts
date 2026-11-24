"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { supplierContactSchema, supplierProfileSchema, validateLogo } from "./schemas";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const done = () => revalidatePath("/productos", "layout");
const noPermission = { error: "No tienes permiso para editar este proveedor." };

// Datos generales y dirección. RLS (catalog.manage) decide si se guarda.
export async function updateSupplierProfile(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = supplierProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(parsed.data).eq("id", id).is("supplier_id", null).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return noPermission;
  done();
  return { success: "Datos guardados." };
}

// Sube el logo al bucket privado "logos" y borra el anterior.
export async function uploadSupplierLogo(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const file = formData.get("logo");
  if (!(file instanceof File)) return { error: "Elige una imagen." };
  const invalid = validateLogo(file);
  if (invalid) return { error: invalid };
  const supabase = await createClient();
  const [{ data: org }, { data: current }] = await Promise.all([
    supabase.rpc("current_org_id"),
    supabase.from("products").select("logo_path").eq("id", id).is("supplier_id", null).maybeSingle(),
  ]);
  if (!org || !current) return noPermission;
  const path = `${org}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
  const up = await supabase.storage.from("logos").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: "No se pudo subir el logo. Revisa que tengas permiso e intenta de nuevo." };
  const { data, error } = await supabase.from("products").update({ logo_path: path }).eq("id", id).select("id");
  if (error || !data?.length) {
    await supabase.storage.from("logos").remove([path]); // no dejar archivos huérfanos
    return error ? { error: dbErrorMessage(error) } : noPermission;
  }
  if (current.logo_path) await supabase.storage.from("logos").remove([current.logo_path]);
  done();
  return { success: "Logo actualizado." };
}

export async function removeSupplierLogo(id: string) {
  const supabase = await createClient();
  const { data: current } = await supabase.from("products").select("logo_path").eq("id", id).maybeSingle();
  if (!current?.logo_path) return;
  const { data } = await supabase.from("products").update({ logo_path: null }).eq("id", id).select("id");
  if (data?.length) await supabase.storage.from("logos").remove([current.logo_path]);
  done();
}

// Si el contacto nuevo o editado es el principal, el anterior deja de serlo (índice único).
async function clearPrimary(supabase: Awaited<ReturnType<typeof createClient>>, supplierId: string, except?: string) {
  let q = supabase.from("supplier_contacts").update({ is_primary: false }).eq("supplier_id", supplierId).eq("is_primary", true);
  if (except) q = q.neq("id", except);
  await q;
}

export async function addSupplierContact(supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = supplierContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("current_org_id");
  if (!org) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (parsed.data.is_primary) await clearPrimary(supabase, supplierId);
  const { error } = await supabase.from("supplier_contacts").insert({ ...parsed.data, organization_id: org, supplier_id: supplierId });
  if (error) return { error: error.code === "42501" ? noPermission.error : dbErrorMessage(error) };
  done();
  return { success: "Contacto agregado." };
}

export async function updateSupplierContact(contactId: string, supplierId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = supplierContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  if (parsed.data.is_primary) await clearPrimary(supabase, supplierId, contactId);
  const { data, error } = await supabase.from("supplier_contacts").update(parsed.data).eq("id", contactId).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return noPermission;
  done();
  return { success: "Contacto guardado." };
}

export async function deleteSupplierContact(formData: FormData) {
  const id = formData.get("id");
  const supplierId = formData.get("supplier_id");
  if (!isUuid(id) || !isUuid(supplierId)) return;
  const supabase = await createClient();
  await supabase.from("supplier_contacts").delete().eq("id", id);
  done();
}
