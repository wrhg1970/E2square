import Link from "next/link";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { institutionStatuses, institutionTypes, potentials, toOptions } from "@/modules/institutions/labels";
import { searchTerm } from "@/modules/institutions/schemas";
import { loadScores, scoreTone } from "@/modules/institutions/scoring";

const PAGE_SIZE = 50;
const pick = <T extends Record<string, string>>(labels: T, v: unknown) => (typeof v === "string" && v in labels ? v : "");

export default async function InstitutionsPage({ searchParams }: PageProps<"/instituciones">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const type = pick(institutionTypes, sp.tipo);
  const status = pick(institutionStatuses, sp.estatus);
  const page = Math.max(1, Number(sp.pagina) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("institutions")
    .select("id, name, institution_type, status, potential, city, country_code, owner_id, last_activity_at, next_activity_at", { count: "exact" })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,legal_name.ilike.%${q}%,city.ilike.%${q}%`);
  if (type) query = query.eq("institution_type", type);
  if (status) query = query.eq("status", status);
  const [{ data, count, error }, { data: profiles }, { data: canWrite }, { data: canImport }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email"),
    supabase.rpc("has_permission", { permission: "institutions.write" }),
    supabase.rpc("has_permission", { permission: "import.run" }),
  ]);

  const scores = await loadScores(supabase, (data ?? []).map((i) => i.id));
  const ownerName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const pageHref = (p: number) => `/instituciones?${new URLSearchParams({ q, tipo: type, estatus: status, pagina: String(p) })}`;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Instituciones</h1>
        <div className="flex gap-2 text-sm">
          {canImport && <Link href="/instituciones/importar" className="rounded-md border border-border px-3 py-2 hover:bg-muted">Importar Excel</Link>}
          {canWrite && <Link href="/instituciones/nueva" className="rounded-md bg-primary px-3 py-2 text-primary-foreground">Nueva institución</Link>}
        </div>
      </div>

      <form className="grid gap-3 sm:grid-cols-4 sm:items-end" role="search">
        <Field label="Buscar" name="q" defaultValue={q} placeholder="Nombre o ciudad" />
        <SelectField label="Tipo" name="tipo" defaultValue={type} options={toOptions(institutionTypes, "Todos")} />
        <SelectField label="Estatus" name="estatus" defaultValue={status} options={toOptions(institutionStatuses, "Todos")} />
        <button type="submit" className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Filtrar</button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar las instituciones. Recarga la página.</p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          {q || type || status ? "Ninguna institución coincide con los filtros." : "Todavía no hay instituciones en tu cartera."}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{count} instituciones</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  {["Nombre", "Tipo", "Estatus", "Potencial", "Puntaje", "Ciudad", "Responsable", "Próxima actividad"].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((i) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="py-2 pr-4"><Link href={`/instituciones/${i.id}`} className="font-medium underline-offset-2 hover:underline">{i.name}</Link></td>
                      <td className="py-2 pr-4">{institutionTypes[i.institution_type as keyof typeof institutionTypes]}</td>
                      <td className="py-2 pr-4">{institutionStatuses[i.status as keyof typeof institutionStatuses]}</td>
                      <td className="py-2 pr-4">{i.potential ? potentials[i.potential as keyof typeof potentials] : "—"}</td>
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2 py-0.5 tabular-nums ${scoreTone(scores.get(i.id)?.score ?? null)}`}>{scores.get(i.id)?.score ?? "—"}</span>
                      </td>
                      <td className="py-2 pr-4">{[i.city, i.country_code].filter(Boolean).join(", ")}</td>
                      <td className="py-2 pr-4">{(i.owner_id && ownerName.get(i.owner_id)) || "—"}</td>
                      <td className={`py-2 pr-4 ${i.next_activity_at && new Date(i.next_activity_at) < new Date() ? "text-red-700" : ""}`}>
                        {i.next_activity_at ? new Date(i.next_activity_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Páginas" className="flex gap-3 text-sm">
              {page > 1 && <Link href={pageHref(page - 1)} className="underline">Anterior</Link>}
              <span>Página {page} de {pages}</span>
              {page < pages && <Link href={pageHref(page + 1)} className="underline">Siguiente</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
