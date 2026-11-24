import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { createClient } from "@/lib/supabase/server";
import { documentCategories, formatSize } from "@/modules/documents/rules";
import { searchTerm } from "@/modules/institutions/schemas";

type Row = {
  id: string; file_name: string; size_bytes: number; category: string; version: number; created_at: string;
  institution_id: string | null; opportunity_id: string | null; product_id: string | null; campaign_id: string | null;
  institutions: { name: string } | null; opportunities: { name: string } | null; products: { name: string } | null; campaigns: { name: string } | null;
};

const categoryTone: Record<string, PillTone> = { proposal: "teal", contract: "violet", presentation: "sky", price_list: "amber", material: "slate", other: "slate" };

// Dónde vive cada documento, con enlace a su ficha.
function linkOf(d: Row) {
  if (d.opportunity_id) return { href: `/oportunidades/${d.opportunity_id}`, kind: "Oportunidad", label: d.opportunities?.name ?? "—" };
  if (d.institution_id) return { href: `/instituciones/${d.institution_id}`, kind: "Institución", label: d.institutions?.name ?? "—" };
  if (d.campaign_id) return { href: `/campanas/${d.campaign_id}`, kind: "Campaña", label: d.campaigns?.name ?? "—" };
  return { href: `/productos/${d.product_id}`, kind: "Proveedor", label: d.products?.name ?? "—" };
}

export default async function DocumentsPage({ searchParams }: PageProps<"/documentos">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const category = typeof sp.categoria === "string" && sp.categoria in documentCategories ? sp.categoria : "";
  const supabase = await createClient();
  // La RLS deja ver solo documentos de lo que el usuario puede ver.
  let query = supabase.from("documents")
    .select("id, file_name, size_bytes, category, version, created_at, institution_id, opportunity_id, product_id, campaign_id, institutions(name), opportunities(name), products(name), campaigns(name)", { count: "exact" })
    .order("created_at", { ascending: false }).limit(200);
  if (q) query = query.ilike("file_name", `%${q}%`);
  if (category) query = query.eq("category", category);
  const { data, count, error } = await query;
  const docs = (data ?? []) as unknown as Row[];
  const filtered = Boolean(q || category);
  const href = (p: { q?: string; categoria?: string }) => {
    const u = new URLSearchParams(Object.entries({ q, categoria: category, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/documentos${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          {count ? `${count} ${count === 1 ? "documento" : "documentos"}${filtered ? " con estos filtros" : ""} · ` : ""}
          Propuestas, contratos y materiales de instituciones, oportunidades, proveedores y campañas. Para subir uno, entra a su ficha.
        </p>
      </div>

      {(filtered || docs.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          <form role="search" className="w-full sm:w-72">
            {category && <input type="hidden" name="categoria" value={category} />}
            <label className="relative block">
              <span className="sr-only">Buscar documento</span>
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre del archivo"
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
            </label>
          </form>
          <Segmented label="Categoría" items={[
            { href: href({ categoria: "" }), label: "Todas", current: !category },
            ...Object.entries(documentCategories).map(([k, label]) => ({ href: href({ categoria: k }), label, current: category === k })),
          ]} />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar los documentos. Recarga la página.</p>
      ) : docs.length === 0 && filtered ? (
        <p className="text-sm text-muted-foreground">Ningún documento coincide con la búsqueda. <Link href="/documentos" className="underline">Quitar filtros</Link></p>
      ) : docs.length === 0 ? (
        <EmptyState icon={FileText} title="Todavía no hay documentos"
          action={<>
            <Link href="/instituciones" className={buttonVariants()}>Ir a Instituciones</Link>
            <Link href="/oportunidades" className={buttonVariants({ variant: "outline" })}>Ir a Oportunidades</Link>
            <Link href="/productos" className={buttonVariants({ variant: "outline" })}>Ir a Proveedores</Link>
          </>}>
          Cada documento se guarda en la ficha a la que pertenece: la propuesta en su oportunidad, el contrato en la institución, la lista de precios en el proveedor.
          Abre una ficha y usa «Subir documento»; aquí verás todos juntos.
        </EmptyState>
      ) : (
        <div className="table-card"><table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>{["Archivo", "Categoría", "Ligado a", "Tamaño", "Fecha"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const link = linkOf(d);
              return (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2 pr-4">
                    <a href={`/documentos/${d.id}`} className="font-medium hover:underline">{d.file_name}</a>
                    {d.version > 1 && <span className="ml-1.5 rounded bg-muted px-1.5 text-xs">v{d.version}</span>}
                  </td>
                  <td className="py-2 pr-4"><Pill tone={categoryTone[d.category]}>{documentCategories[d.category as keyof typeof documentCategories]}</Pill></td>
                  <td className="py-2 pr-4">
                    <span className="text-xs text-muted-foreground">{link.kind} · </span>
                    <Link href={link.href} className="hover:underline">{link.label}</Link>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 tabular-nums">{formatSize(d.size_bytes)}</td>
                  <td className="whitespace-nowrap py-2 pr-4">{new Date(d.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
