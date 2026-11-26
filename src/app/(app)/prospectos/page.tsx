import Link from "next/link";
import { Search, Upload, UserPlus } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectField, TextareaField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { createClient } from "@/lib/supabase/server";
import { searchTerm } from "@/modules/institutions/schemas";
import { updateLead } from "@/modules/leads/actions";
import { leadStatuses, leadStatusTone, type LeadStatus } from "@/modules/leads/labels";

const LIMIT = 200;
const statusKeys = Object.keys(leadStatuses) as LeadStatus[];
const when = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function LeadsPage({ searchParams }: PageProps<"/prospectos">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const status = statusKeys.includes(sp.estatus as LeadStatus) ? (sp.estatus as LeadStatus) : null;
  const supabase = await createClient();

  let query = supabase.from("leads")
    .select("id, full_name, email, phone, city, region, respondent, age_range, grade, received_at, notes, status, product_id", { count: "exact" })
    .order("received_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(LIMIT);
  if (status) query = query.eq("status", status);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`);
  const [{ data: leads, count, error }, counts, { data: products }] = await Promise.all([
    query,
    Promise.all(statusKeys.map((s) => supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", s))),
    supabase.from("products").select("id, name"),
  ]);
  const byStatus = Object.fromEntries(statusKeys.map((s, i) => [s, counts[i].count ?? 0])) as Record<LeadStatus, number>;
  const all = statusKeys.reduce((n, s) => n + byStatus[s], 0);
  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
  const href = (estatus: string | null) => `/prospectos?${new URLSearchParams({ ...(estatus && { estatus }), ...(q && { q }) })}`;

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
      ) : all === 0 ? (
        <EmptyState icon={UserPlus} title="Todavía no hay prospectos"
          action={<Link href="/prospectos/importar" className={buttonVariants()}>Importar desde Google Sheets</Link>}>
          Pega la liga de la hoja donde llegan tus leads de Meta. Puedes repetirlo cada que lleguen más: los que ya entraron no se duplican.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Prospectos" value={all} />
            <StatTile label="Nuevos" value={byStatus.new} hint="Sin contactar todavía" tone={byStatus.new ? "warn" : "default"} />
            <StatTile label="En contacto" value={byStatus.contacting} />
            <StatTile label="Interesados" value={byStatus.qualified} hint={`${byStatus.converted} convertidos`} tone="good" />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Segmented label="Filtrar por estatus" items={[
              { href: href(null), label: `Todos (${all})`, current: !status },
              ...statusKeys.map((s) => ({ href: href(s), label: `${leadStatuses[s]} (${byStatus[s]})`, current: status === s })),
            ]} />
            <form role="search" className="w-full sm:w-72">
              {status && <input type="hidden" name="estatus" value={status} />}
              <label className="relative block">
                <span className="sr-only">Buscar prospecto</span>
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" name="q" defaultValue={q} placeholder="Nombre, correo, teléfono o ciudad"
                  className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
              </label>
            </form>
          </div>

          {!leads?.length ? (
            <p className="text-sm text-muted-foreground">Ningún prospecto coincide. <Link href="/prospectos" className="underline">Quita los filtros</Link>.</p>
          ) : (
            <ul className="table-card divide-y divide-border text-sm">
              {leads.map((l) => (
                <li key={l.id}>
                  <details className="group">
                    <summary className="grid cursor-pointer list-none gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                      <span className="font-medium">{l.full_name}<span className="block text-xs font-normal text-muted-foreground">{l.respondent ?? ""}</span></span>
                      <span className="min-w-0 truncate text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ")}</span>
                      <span>{[l.city, l.region].filter(Boolean).join(", ") || "—"}</span>
                      <span className="text-muted-foreground">{l.received_at ? when(l.received_at) : "—"}</span>
                      <Pill tone={leadStatusTone[l.status as LeadStatus]}>{leadStatuses[l.status as LeadStatus]}</Pill>
                    </summary>
                    <div className="grid gap-4 pb-4 pt-1 sm:grid-cols-2">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className="text-muted-foreground">Correo</dt><dd>{l.email ? <a href={`mailto:${l.email}`} className="underline">{l.email}</a> : "—"}</dd>
                        <dt className="text-muted-foreground">Teléfono</dt>
                        <dd>{l.phone ? <><a href={`tel:+${l.phone.replace(/\D/g, "")}`} className="underline">{l.phone}</a> · <a href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="underline">WhatsApp</a></> : "—"}</dd>
                        <dt className="text-muted-foreground">Edad</dt><dd>{l.age_range ?? "—"}</dd>
                        <dt className="text-muted-foreground">Grado</dt><dd>{l.grade ?? "—"}</dd>
                        <dt className="text-muted-foreground">Producto</dt><dd>{(l.product_id && productName.get(l.product_id)) ?? "—"}</dd>
                      </dl>
                      <ActionForm action={updateLead.bind(null, l.id)} submitLabel="Guardar" submitVariant="outline">
                        <SelectField label="Estatus" name="status" defaultValue={l.status} options={statusKeys.map((s) => ({ value: s, label: leadStatuses[s] }))} />
                        <TextareaField label="Notas de seguimiento" name="notes" rows={3} maxLength={4000} defaultValue={l.notes ?? ""} />
                      </ActionForm>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {(count ?? 0) > LIMIT && <p className="text-sm text-muted-foreground">Se muestran los {LIMIT} más recientes de {count}. Usa el buscador o los filtros.</p>}
        </>
      )}
    </div>
  );
}
