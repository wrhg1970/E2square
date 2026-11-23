import { ActionForm } from "@/components/ui/action-form";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { deleteDocument, uploadDocument } from "./actions";
import { ACCEPT_ATTR, documentCategories, formatSize } from "./rules";

type Props = { institutionId?: string; opportunityId?: string; productId?: string; campaignId?: string; canWrite: boolean };
type Doc = { id: string; root_id: string; version: number; file_name: string; size_bytes: number; category: string; uploaded_by: string; created_at: string };

// Documentos de una institución, oportunidad, proveedor/producto o campaña: última versión de cada uno, versiones anteriores y subir.
export async function DocumentsPanel({ institutionId, opportunityId, productId, campaignId, canWrite }: Props) {
  const supabase = await createClient();
  const [{ data: meId }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "admin.structure" }),
  ]);
  const target = { institution_id: institutionId, opportunity_id: opportunityId, product_id: productId, campaign_id: campaignId };
  let q = supabase.from("documents").select("id, root_id, version, file_name, size_bytes, category, uploaded_by, created_at").order("version", { ascending: false }).limit(200);
  q = opportunityId ? q.eq("opportunity_id", opportunityId)
    : institutionId ? q.eq("institution_id", institutionId)
    : productId ? q.eq("product_id", productId) : q.eq("campaign_id", campaignId!);
  const { data, error } = await q;
  // Agrupa por documento original; la primera fila de cada grupo es la versión más reciente.
  const groups = new Map<string, Doc[]>();
  for (const d of (data ?? []) as Doc[]) groups.set(d.root_id, [...(groups.get(d.root_id) ?? []), d]);
  const docs = [...groups.values()].sort((a, b) => b[0].created_at.localeCompare(a[0].created_at));
  const meta = (d: Doc) => `${documentCategories[d.category as keyof typeof documentCategories]} · ${formatSize(d.size_bytes)} · ${new Date(d.created_at).toLocaleDateString("es-MX")}`;
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-700">No se pudieron cargar los documentos.</p>}
      {!error && docs.length === 0 && <p className="text-sm text-muted-foreground">Sin documentos todavía.</p>}
      {docs.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {docs.map(([d, ...older]) => (
            <li key={d.root_id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <a href={`/documentos/${d.id}`} className="font-medium underline">{d.file_name}</a>
                  {d.version > 1 && <span className="ml-1 rounded bg-muted px-1.5 text-xs">v{d.version}</span>}{" "}
                  <span className="text-muted-foreground">· {meta(d)}</span>
                </span>
                {(d.uploaded_by === meId || isAdmin) && (
                  <form action={deleteDocument}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" className="text-xs underline">Eliminar</button>
                  </form>
                )}
              </div>
              {older.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Versiones anteriores ({older.length})</summary>
                  <ul className="mt-1 space-y-1 pl-4">
                    {older.map((o) => (
                      <li key={o.id}><a href={`/documentos/${o.id}`} className="underline">v{o.version} · {o.file_name}</a> <span className="text-muted-foreground">· {meta(o)}</span></li>
                    ))}
                  </ul>
                </details>
              )}
              {canWrite && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Subir nueva versión</summary>
                  <ActionForm action={uploadDocument.bind(null, { ...target, root_id: d.root_id })} submitLabel="Guardar versión" className="mt-2 flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium">Archivo de la nueva versión de {d.file_name}</span>
                      <input type="file" name="file" accept={ACCEPT_ATTR} required className="text-sm" />
                    </label>
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <ActionForm action={uploadDocument.bind(null, target)} submitLabel="Subir documento" className="flex flex-wrap items-end gap-3">
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
