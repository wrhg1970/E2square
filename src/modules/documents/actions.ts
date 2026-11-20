"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, type ActionState } from "@/lib/action-state";
import { createClient } from "@/lib/supabase/server";
import { documentCategories, safeFileName, validateFile } from "./rules";

type Target = { institution_id?: string; opportunity_id?: string };
const pathFor = (t: Target) => (t.opportunity_id ? `/oportunidades/${t.opportunity_id}` : `/instituciones/${t.institution_id}`);
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// Sube el archivo al bucket privado y registra el documento. RLS de Storage y de documents deciden el permiso.
export async function uploadDocument(target: Target, _prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isUuid(target.institution_id) && !isUuid(target.opportunity_id)) return { error: "Documento sin destino." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Elige un archivo." };
  const invalid = validateFile(file);
  if (invalid) return { error: invalid };
  const category = String(formData.get("category") ?? "other");
  if (!(category in documentCategories)) return { error: "Elige una categoría." };

  const supabase = await createClient();
  const [{ data: orgId }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
  if (!orgId || !me) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const path = `${orgId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const up = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: "No se pudo subir el archivo. Revisa que tengas permiso e intenta de nuevo." };

  const { error } = await supabase.from("documents").insert({
    organization_id: orgId, storage_path: path, file_name: file.name.slice(0, 255), mime_type: file.type, size_bytes: file.size,
    category, institution_id: target.institution_id ?? null, opportunity_id: target.opportunity_id ?? null, uploaded_by: me,
  });
  if (error) {
    await supabase.storage.from("documents").remove([path]); // no dejar archivos huérfanos
    return { error: dbErrorMessage(error) };
  }
  revalidatePath(pathFor(target));
  return { success: "Documento guardado." };
}

export async function deleteDocument(formData: FormData) {
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("documents").delete().eq("id", id).select("storage_path, institution_id, opportunity_id");
  const doc = data?.[0];
  if (!doc) return;
  await supabase.storage.from("documents").remove([doc.storage_path]);
  revalidatePath(pathFor({ institution_id: doc.institution_id ?? undefined, opportunity_id: doc.opportunity_id ?? undefined }));
}
