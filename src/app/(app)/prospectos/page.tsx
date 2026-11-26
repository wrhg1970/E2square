import Link from "next/link";
import { Upload, UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { searchTerm } from "@/modules/institutions/schemas";
import { type LeadStatus } from "@/modules/leads/labels";
import { LeadsView } from "./_vista/leads-view";
import { statusKeys } from "./_vista/shared";

const LIMIT = 200;

export default async function LeadsPage({ searchParams }: PageProps<"/prospectos">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const archived = sp.estatus === "archivados";
  const status = statusKeys.includes(sp.estatus as LeadStatus) ? (sp.estatus as LeadStatus) : null;
  const selected = typeof sp.id === "string" ? sp.id : null;
  const supabase = await createClient();

  let query = supabase.from("leads")
    .select("id, full_name, email, phone, city, region, country, respondent, age_range, grade, received_at, notes, status, product_id", { count: "exact" })
    .order("received_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(LIMIT);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`);
  const [{ data: leads, count, error }, counts, { count: archivedCount }, { data: products }] = await Promise.all([
    query,
    Promise.all(statusKeys.map((s) => supabase.from("leads").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", s))),
    supabase.from("leads").select("id", { count: "exact", head: true }).not("archived_at", "is", null),
    supabase.from("products").select("id, name"),
  ]);
  const byStatus = Object.fromEntries(statusKeys.map((s, i) => [s, counts[i].count ?? 0])) as Record<LeadStatus, number>;
  const all = statusKeys.reduce((n, s) => n + byStatus[s], 0);
  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospectos</h1>
          <p className="text-sm text-muted-foreground">Familias y alumnos que llegan de Meta y otros formularios, antes de ser clientes</p>
        </div>
        <Link href="/prospectos/importar" className={buttonVariants()}><Upload aria-hidden className="size-4" /> Importar</Link>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar los prospectos. Recarga la página.</p>
      ) : all + (archivedCount ?? 0) === 0 ? (
        <EmptyState icon={UserPlus} title="Todavía no hay prospectos"
          action={<Link href="/prospectos/importar" className={buttonVariants()}>Importar desde Google Sheets</Link>}>
          Pega la liga de la hoja donde llegan tus leads de Meta. Puedes repetirlo cada que lleguen más: los que ya entraron no se duplican.
        </EmptyState>
      ) : (
        <>
          <LeadsView leads={leads ?? []} byStatus={byStatus} all={all} status={status} q={q} productName={productName} selected={selected}
            count={count ?? 0} limit={LIMIT} archived={archived} archivedCount={archivedCount ?? 0} />
          {!leads?.length && <p className="text-sm text-muted-foreground">{archived ? "No hay prospectos archivados." : "Ningún prospecto coincide."} <Link href="/prospectos" className="underline">Quita los filtros</Link>.</p>}
          {(count ?? 0) > LIMIT && <p className="text-sm text-muted-foreground">Se muestran los {LIMIT} más recientes de {count}. Usa el buscador o los filtros.</p>}
        </>
      )}
    </div>
  );
}
