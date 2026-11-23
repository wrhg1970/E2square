import Link from "next/link";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, opportunityStatuses, totalsByCurrency } from "@/modules/opportunities/labels";
import { StageForm } from "@/modules/opportunities/stage-form";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/modules/activities/time";

type Opp = {
  id: string; name: string; institution_id: string; stage_id: string; owner_id: string | null; currency_code: string;
  amount: number; probability: number; expected_close_date: string | null; status: string; stage_entered_at: string;
};

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default async function OpportunitiesPage({ searchParams }: PageProps<"/oportunidades">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: products }, { data: me }, { data: canImport }] = await Promise.all([
    supabase.from("products").select("id, name, default_pipeline_id").eq("active", true).not("default_pipeline_id", "is", null).order("name"),
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "import.run" }),
  ]);
  const product = (products ?? []).find((p) => p.id === sp.producto) ?? products?.[0];
  const view = sp.vista === "tabla" ? "tabla" : "kanban";
  const mine = sp.mias === "1";

  if (!product) return <p className="text-sm text-muted-foreground">No hay proveedores con pipeline. Configúralos en Proveedores.</p>;

  let query = supabase
    .from("opportunities")
    .select("id, name, institution_id, stage_id, owner_id, currency_code, amount, probability, expected_close_date, status, stage_entered_at")
    .eq("pipeline_id", product.default_pipeline_id!)
    .order("expected_close_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (mine && me) query = query.eq("owner_id", me);
  const [{ data: stages }, { data: opps, error }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, sort_order, sla_days, is_won, is_lost, required_fields").eq("pipeline_id", product.default_pipeline_id!).order("sort_order"),
    query,
  ]);
  const rows = (opps ?? []) as Opp[];
  const instIds = [...new Set(rows.map((o) => o.institution_id))];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));
  const open = rows.filter((o) => o.status === "open");
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const qs = (p: Record<string, string>) => `/oportunidades?${new URLSearchParams({ producto: product.id, vista: view, ...(mine ? { mias: "1" } : {}), ...p })}`;

  return (
    <div className="space-y-6">
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">
            Abiertas: {totalsByCurrency(open, (o) => o.currency_code, (o) => Number(o.amount))} · Ponderado:{" "}
            {totalsByCurrency(open, (o) => o.currency_code, (o) => (Number(o.amount) * o.probability) / 100)}
          </p>
        </div>
        <div className="flex gap-2">
          {canImport && <Link href="/oportunidades/importar" className={buttonVariants({ variant: "outline" })}>Importar Excel</Link>}
          <Link href="/oportunidades/nueva" className={buttonVariants()}>Nueva oportunidad</Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <SelectField label="Proveedor" name="producto" defaultValue={product.id} options={(products ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        <input type="hidden" name="vista" value={view} />
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="mias" value="1" defaultChecked={mine} /> Solo mías</label>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>Ver</button>
        <nav aria-label="Vista" className="ml-auto flex gap-1 rounded-lg border border-border bg-background p-1 text-sm shadow-sm">
          <Link href={qs({ vista: "kanban" })} aria-current={view === "kanban" ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${view === "kanban" ? "bg-band font-semibold text-white" : "text-muted-foreground hover:text-foreground"}`}>Kanban</Link>
          <Link href={qs({ vista: "tabla" })} aria-current={view === "tabla" ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${view === "tabla" ? "bg-band font-semibold text-white" : "text-muted-foreground hover:text-foreground"}`}>Tabla</Link>
        </nav>
      </form>

      {error && <p role="alert" className="text-sm text-red-700">No se pudieron cargar las oportunidades. Recarga la página.</p>}

      {view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {(stages ?? []).map((s) => {
            const cards = rows.filter((o) => o.stage_id === s.id && (o.status === "open" || s.is_won || s.is_lost));
            return (
              <section key={s.id} aria-label={s.name} className="w-72 shrink-0 space-y-2 rounded-xl bg-muted p-3">
                <header className="text-sm">
                  <p className="font-semibold">{s.name} <span className="font-normal text-muted-foreground">({cards.length})</span></p>
                  <p className="text-xs text-muted-foreground">{totalsByCurrency(cards, (o) => o.currency_code, (o) => Number(o.amount))}</p>
                </header>
                {cards.map((o) => {
                  const late = s.sla_days && o.status === "open" && daysSince(o.stage_entered_at) > s.sla_days;
                  return (
                    <article key={o.id} className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm shadow-sm">
                      <Link href={`/oportunidades/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                      <p className="text-muted-foreground">{instName.get(o.institution_id)}</p>
                      <p>{formatMoney(o.amount, o.currency_code)} · {o.probability}%</p>
                      {late && <p className="text-xs font-medium text-amber-700">Lleva {daysSince(o.stage_entered_at)} días en esta etapa (SLA {s.sla_days})</p>}
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">Mover</summary>
                        <StageForm opportunityId={o.id} stageId={o.stage_id} stages={stages ?? []} compact />
                      </details>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">No hay oportunidades en este pipeline.</p>
      ) : (
        <div className="table-card">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>{["Oportunidad", "Institución", "Etapa", "Estado", "Monto", "Prob.", "Cierre estimado"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="py-2 pr-4"><Link href={`/oportunidades/${o.id}`} className="font-medium hover:underline">{o.name}</Link></td>
                  <td className="py-2 pr-4"><Link href={`/instituciones/${o.institution_id}`} className="hover:underline">{instName.get(o.institution_id)}</Link></td>
                  <td className="py-2 pr-4">{stageById.get(o.stage_id)?.name}</td>
                  <td className="py-2 pr-4">{opportunityStatuses[o.status as keyof typeof opportunityStatuses]}</td>
                  <td className="py-2 pr-4">{formatMoney(o.amount, o.currency_code)}</td>
                  <td className="py-2 pr-4">{o.probability}%</td>
                  <td className="py-2 pr-4">{o.expected_close_date ? formatDay(o.expected_close_date) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
