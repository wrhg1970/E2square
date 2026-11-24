"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { documentCategories, safeFileName, validateFile } from "./rules";

// Título, descripción y vigencia opcionales; vacío = null.
function details(formData: FormData): { title: string | null; description: string | null; expires_on: string | null } | string {
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const [title, description, expires_on] = [text("title"), text("description"), text("expires_on")];
  if (title && title.length > 200) return "El título admite hasta 200 caracteres.";
  if (description && description.length > 1000) return "La descripción admite hasta 1,000 caracteres.";
  if (expires_on && !(/^\d{4}-\d{2}-\d{2}$/.test(expires_on) && !Number.isNaN(Date.parse(expires_on)))) return "La fecha de vigencia no es válida.";
  return { title, description, expires_on };
}

type Target = { institution_id?: string; opportunity_id?: string; product_id?: string; campaign_id?: string; root_id?: string; general?: boolean };
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const nn = (v: string | null) => v ?? undefined;

function revalidate(t: Target) {
  if (t.opportunity_id) revalidatePath(`/oportunidades/${t.opportunity_id}`);
  if (t.institution_id) revalidatePath(`/instituciones/${t.institution_id}`);
  if (t.product_id) revalidatePath(`/productos/${t.product_id}`);
  if (t.campaign_id) revalidatePath(`/campanas/${t.campaign_id}`);
  revalidatePath("/documentos");
}

// Sube el archivo al bucket privado y registra el documento. RLS de Storage y de documents deciden el permiso.
export async function uploadDocument(target: Target, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!target.general && ![target.institution_id, target.opportunity_id, target.product_id, target.campaign_id].some(isUuid)) return { error: "Documento sin destino." };
  if (target.root_id !== undefined && !isUuid(target.root_id)) return { error: "Documento sin destino." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Elige un archivo." };
  const invalid = validateFile(file);
  if (invalid) return { error: invalid };
  const category = String(formData.get("category") ?? "other");
  if (!(category in documentCategories)) return { error: "Elige una categoría." };
  const extra = details(formData);
  if (typeof extra === "string") return { error: extra };
  // Solo se envían si hay valor: así la subida sigue funcionando aunque falte la migración de vigencia.
  const optional = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null));

  const supabase = await createClient();
  const [{ data: orgId }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
  if (!orgId || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const path = `${orgId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: "No se pudo subir el archivo. Revisa que tengas permiso e intenta de nuevo." };

  const { error } = await supabase.from("documents").insert({
    organization_id: orgId, storage_path: path, file_name: file.name.slice(0, 255), mime_type: file.type, size_bytes: file.size,
    category, institution_id: target.institution_id ?? null, opportunity_id: target.opportunity_id ?? null,
    product_id: target.product_id ?? null, campaign_id: target.campaign_id ?? null, root_id: target.root_id ?? null, uploaded_by: me, ...optional,
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]); // no dejar archivos huérfanos
    return { error: dbErrorMessage(error) };
  }
  revalidate(target);
  return { success: target.root_id ? "Nueva versión guardada." : "Documento guardado." };
}

export async function deleteDocument(formData: FormData) {
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("documents").delete().eq("id", id).select("storage_path, institution_id, opportunity_id, product_id, campaign_id");
  const doc = data?.[0];
  if (!doc) return;
  await supabase.storage.from("documents").remove([doc.storage_path]);
  revalidate({ institution_id: nn(doc.institution_id), opportunity_id: nn(doc.opportunity_id), product_id: nn(doc.product_id), campaign_id: nn(doc.campaign_id) });
}

// Sube desde la pantalla Documentos: ligado a una institución o general de la empresa.
export async function uploadFromRepository(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const inst = String(formData.get("institution_id") ?? "");
  if (inst && !isUuid(inst)) return { error: "Elige una institución de la lista o déjalo en General." };
  return uploadDocument(inst ? { institution_id: inst } : { general: true }, _prev, formData);
}

// Edita los datos descriptivos; la RLS deja editar solo a quien lo subió o a un administrador.
export async function updateDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  if (!isUuid(id)) return { error: "Documento no válido." };
  const category = String(formData.get("category") ?? "");
  if (!(category in documentCategories)) return { error: "Elige una categoría." };
  const extra = details(formData);
  if (typeof extra === "string") return { error: extra };
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").update({ ...extra, category }).eq("id", id).select("id");
  if (error) return { error: dbErrorMessage(error) };
  if (!data?.length) return { error: "Solo quien lo subió o un administrador puede editarlo." };
  revalidatePath("/documentos");
  return { success: "Cambios guardados." };
}

// Enlace para compartir por correo: firmado por 7 días, solo si el usuario ve el documento.
export async function shareLink(id: string): Promise<{ url?: string; name?: string; error?: string }> {
  if (!isUuid(id)) return { error: "Documento no válido." };
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!doc) return { error: "Documento no encontrado o sin permiso." };
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 7 * 24 * 3600, { download: doc.file_name });
  if (error || !data) return { error: "No se pudo generar el enlace." };
  return { url: data.signedUrl, name: doc.file_name };
}
