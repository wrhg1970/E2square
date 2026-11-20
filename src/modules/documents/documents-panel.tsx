import { ActionForm } from "@/components/ui/action-form";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { deleteDocument, uploadDocument } from "./actions";
import { ACCEPT_ATTR, documentCategories, formatSize } from "./rules";

// Documentos de una institución u oportunidad: lista (RLS) + subir, si puede escribir.
export async function DocumentsPanel({ institutionId, opportunityId, canWrite }: { institutionId?: string; opportunityId?: string; canWrite: boolean }) {
  const supabase = await createClient();
  const [{ data: meId }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "admin.structure" }),
  ]);
  let q = supabase.from("documents").select("id, file_name, size_bytes, category, uploaded_by, created_at").order("created_at", { ascending: false }).limit(100);
  q = opportunityId ? q.eq("opportunity_id", opportunityId) : q.eq("institution_id", institutionId!);
  const { data, error } = await q;
  const docs = data ?? [];
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">No se pudieron cargar los documentos.</p>}
      {!error && docs.length === 0 && <p className="text-sm text-muted-foreground">Sin documentos todavía.</p>}
      {docs.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <a href={`/documentos/${d.id}`} className="font-medium underline">{d.file_name}</a>{" "}
                <span className="text-muted-foreground">
                  · {documentCategories[d.category as keyof typeof documentCategories]} · {formatSize(d.size_bytes)} · {new Date(d.created_at).toLocaleDateString("es-MX")}
                </span>
              </span>
              {(d.uploaded_by === meId || isAdmin) && (
                <form action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="text-xs underline">Eliminar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <ActionForm action={uploadDocument.bind(null, { institution_id: institutionId, opportunity_id: opportunityId })} submitLabel="Subir documento" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Archivo (máx. 15 MB)</span>
            <input type="file" name="file" accept={ACCEPT_ATTR} required className="text-sm" />
          </label>
          <SelectField label="Categoría" name="category" defaultValue="proposal" options={Object.entries(documentCategories).map(([value, label]) => ({ value, label }))} />
        </ActionForm>
      )}
    </div>
  );
}
