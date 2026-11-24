import Link from "next/link";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { institutionStatuses, institutionTypes, potentials, toOptions } from "@/modules/institutions/labels";
import { searchTerm } from "@/modules/institutions/schemas";
import { loadScores, scoreTone } from "@/modules/institutions/scoring";
import { buttonVariants } from "@/components/ui/button";
import { Building2, FileSpreadsheet, Plus, Search } from "lucide-react";

const PAGE_SIZE = 50;
const statusTone: Record<string, string> = {
  prospect: "bg-sky-50 text-sky-800 ring-sky-200",
  active_client: "bg-teal-50 text-teal-800 ring-teal-200",
  former_client: "bg-amber-50 text-amber-800 ring-amber-200",
  inactive: "bg-slate-100 text-slate-600 ring-slate-200",
};
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
  const filtered = Boolean(q || type || status);
  const pageHref = (p: number) => `/instituciones?${new URLSearchParams({ q, tipo: type, estatus: status, pagina: String(p) })}`;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Instituciones</h1>
        <div className="flex gap-2 text-sm">
          {canImport && <Link href="/instituciones/importar" className={buttonVariants({ variant: "outline" })}>Importar Excel</Link>}
          {canWrite && <Link href="/instituciones/nueva" className={buttonVariants()}>Nueva institución</Link>}
        </div>
      </div>

      {(filtered || !!data?.length) && (
        <form role="search" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-3 shadow-sm">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">Buscar</span>
            <span className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input name="q" defaultValue={q} placeholder="Nombre, razón social o ciudad"
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
            </span>
          </label>
          <SelectField label="Tipo" name="tipo" defaultValue={type} options={toOptions(institutionTypes, "Todos")} className="w-full sm:w-44" />
          <SelectField label="Estatus" name="estatus" defaultValue={status} options={toOptions(institutionStatuses, "Todos")} className="w-full sm:w-40" />
          <button type="submit" className={buttonVariants({ variant: "outline" })}>Filtrar</button>
          {filtered && <Link href="/instituciones" className="h-9 content-center text-sm text-muted-foreground underline">Quitar filtros</Link>}
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar las instituciones. Recarga la página.</p>
      ) : !data?.length && filtered ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center text-sm">
          <p className="font-medium">Ninguna institución coincide con los filtros.</p>
          <p className="mt-1 text-muted-foreground">Prueba con otra palabra o <Link href="/instituciones" className="text-foreground underline">quita los filtros</Link>.</p>
        </div>
      ) : !data?.length ? (
        <section aria-labelledby="vacio" className="rounded-xl border border-border bg-background p-6 shadow-sm sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-teal-700"><Building2 aria-hidden className="size-6" /></span>
            <h2 id="vacio" className="mt-4 text-lg font-semibold">Empieza tu cartera de instituciones</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registra los colegios, universidades y grupos con los que trabajas. Después podrás darles seguimiento, abrir oportunidades y agendar actividades.
            </p>
          </div>
          {canImport || canWrite ? (
            <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
              {canImport && (
                <div className="flex flex-col rounded-lg border border-border p-5">
                  <FileSpreadsheet aria-hidden className="size-5 text-teal-700" />
                  <h3 className="mt-3 font-semibold">¿Ya tienes una lista en Excel?</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">Descarga la plantilla, copia tus datos y súbela. Se cargan todas de una vez.</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link href="/instituciones/importar" className={buttonVariants({ variant: canWrite ? "outline" : "default" })}>Importar Excel</Link>
                    <a href="/instituciones/importar/plantilla" download className="text-sm underline">Descargar plantilla</a>
                  </div>
                </div>
              )}
              {canWrite && (
                <div className="flex flex-col rounded-lg border border-border p-5">
                  <Plus aria-hidden className="size-5 text-teal-700" />
                  <h3 className="mt-3 font-semibold">Dar de alta una por una</h3>
                  <p className="mt-1 flex-1 text-sm text-muted-foreground">Escribe su sitio web y traemos sus datos para que solo los revises antes de guardar.</p>
                  <div className="mt-4">
                    <Link href="/instituciones/nueva" className={buttonVariants()}>Nueva institución</Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">Pide a un administrador que registre instituciones o que te dé permiso para hacerlo.</p>
          )}
        </section>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{count === 1 ? "1 institución" : `${count} instituciones`}</p>
          <div className="table-card">
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
                      <td className="py-2 pr-4">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusTone[i.status] ?? statusTone.inactive}`}>
                          {institutionStatuses[i.status as keyof typeof institutionStatuses]}
                        </span>
                      </td>
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
