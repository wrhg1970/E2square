import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { documentCategories, formatSize } from "@/modules/documents/rules";
import { searchTerm } from "@/modules/institutions/schemas";

type Row = {
  id: string; file_name: string; size_bytes: number; category: string; version: number; created_at: string;
  institution_id: string | null; opportunity_id: string | null; product_id: string | null; campaign_id: string | null;
  institutions: { name: string } | null; opportunities: { name: string } | null; products: { name: string } | null; campaigns: { name: string } | null;
};

// Dónde vive cada documento, con enlace a su ficha.
function linkOf(d: Row) {
  if (d.opportunity_id) return { href: `/oportunidades/${d.opportunity_id}`, label: `Oportunidad: ${d.opportunities?.name ?? "—"}` };
  if (d.institution_id) return { href: `/instituciones/${d.institution_id}`, label: d.institutions?.name ?? "—" };
  if (d.campaign_id) return { href: `/campanas/${d.campaign_id}`, label: `Campaña: ${d.campaigns?.name ?? "—"}` };
  return { href: `/productos/${d.product_id}`, label: `Proveedor: ${d.products?.name ?? "—"}` };
}

export default async function DocumentsPage({ searchParams }: PageProps<"/documentos">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const category = typeof sp.categoria === "string" && sp.categoria in documentCategories ? sp.categoria : "";
  const supabase = await createClient();
  // La RLS deja ver solo documentos de lo que el usuario puede ver.
  let query = supabase.from("documents")
    .select("id, file_name, size_bytes, category, version, created_at, institution_id, opportunity_id, product_id, campaign_id, institutions(name), opportunities(name), products(name), campaigns(name)")
    .order("created_at", { ascending: false }).limit(200);
  if (q) query = query.ilike("file_name", `%${q}%`);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  const docs = (data ?? []) as unknown as Row[];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">Todos los documentos que puedes ver: de instituciones, oportunidades, proveedores y campañas. Para subir uno, entra a su ficha.</p>
      </div>
      <form role="search" className="flex flex-wrap items-end gap-3">
        <Field label="Buscar" name="q" defaultValue={q} placeholder="Nombre del archivo" className="min-w-56 flex-1" />
        <SelectField label="Categoría" name="categoria" defaultValue={category}
          options={[{ value: "", label: "Todas" }, ...Object.entries(documentCategories).map(([value, label]) => ({ value, label }))]} />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>Buscar</button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar los documentos. Recarga la página.</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{q || category ? "Ningún documento coincide con la búsqueda." : "Todavía no hay documentos."}</p>
      ) : (
        <div className="table-card"><table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr><th className="py-2 pr-4 font-medium">Archivo</th><th className="py-2 pr-4 font-medium">Ligado a</th><th className="py-2 pr-4 font-medium">Categoría</th><th className="py-2 pr-4 font-medium">Tamaño</th><th className="py-2 font-medium">Fecha</th></tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const link = linkOf(d);
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 pr-4">
                    <a href={`/documentos/${d.id}`} className="font-medium underline">{d.file_name}</a>
                    {d.version > 1 && <span className="ml-1 rounded bg-muted px-1.5 text-xs">v{d.version}</span>}
                  </td>
                  <td className="py-2 pr-4"><Link href={link.href} className="hover:underline">{link.label}</Link></td>
                  <td className="py-2 pr-4">{documentCategories[d.category as keyof typeof documentCategories]}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatSize(d.size_bytes)}</td>
                  <td className="py-2">{new Date(d.created_at).toLocaleDateString("es-MX")}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
