import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, initials, totalsByCurrency } from "@/modules/opportunities/labels";
import { StageForm } from "@/modules/opportunities/stage-form";
import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/modules/activities/time";

type Opp = {
  id: string; name: string; institution_id: string; stage_id: string; owner_id: string | null; currency_code: string;
  amount: number; probability: number; expected_close_date: string | null; status: string; stage_entered_at: string;
};
type Stage = { id: string; name: string; sort_order: number; sla_days: number | null; is_won: boolean; is_lost: boolean; required_fields: string[] };

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const money = (rows: Opp[]) => totalsByCurrency(rows, (o) => o.currency_code, (o) => Number(o.amount));
const stageColor = (s: Stage, i: number) =>
  s.is_won ? "#14b8a6" : s.is_lost ? "#ef4444" : ["#94a3b8", "#60a5fa", "#a78bfa", "#f59e0b", "#f472b6", "#34d399"][i % 6];
const segOn = "bg-band font-semibold text-white";
const segOff = "text-muted-foreground hover:text-foreground";
const ROW = "grid gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_3rem_8rem_9rem_6rem_9rem_6rem] md:items-center";

export default async function OpportunitiesPage({ searchParams }: PageProps<"/oportunidades">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: products }, { data: me }, { data: canImport }] = await Promise.all([
    supabase.from("products").select("id, name, default_pipeline_id").eq("active", true).not("default_pipeline_id", "is", null).order("name"),
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "import.run" }),
  ]);
  const product = (products ?? []).find((p) => p.id === sp.producto) ?? products?.[0];
  // "kanban" se mantiene por los enlaces guardados de antes; la vista por defecto es la lista.
  const view = sp.vista === "tablero" || sp.vista === "kanban" ? "tablero" : "lista";
  const mine = sp.mias === "1";
  const search = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  if (!product) return <p className="text-sm text-muted-foreground">No hay proveedores con pipeline. Configúralos en Proveedores.</p>;

  let query = supabase
    .from("opportunities")
    .select("id, name, institution_id, stage_id, owner_id, currency_code, amount, probability, expected_close_date, status, stage_entered_at")
    .eq("pipeline_id", product.default_pipeline_id!)
    .order("expected_close_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (mine && me) query = query.eq("owner_id", me);
  const [{ data: stageData }, { data: opps, error }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, sort_order, sla_days, is_won, is_lost, required_fields").eq("pipeline_id", product.default_pipeline_id!).order("sort_order"),
    query,
  ]);
  const stages = (stageData ?? []) as Stage[];
  const all = (opps ?? []) as Opp[];
  const instIds = [...new Set(all.map((o) => o.institution_id))];
  const ownerIds = [...new Set(all.map((o) => o.owner_id).filter((id): id is string => !!id))];
  const [{ data: insts }, { data: owners }] = await Promise.all([
    instIds.length ? supabase.from("institutions").select("id, name").in("id", instIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ownerIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", ownerIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
  ]);
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));
  const ownerById = new Map((owners ?? []).map((p) => [p.id, p]));
  const rows = search ? all.filter((o) => `${o.name} ${instName.get(o.institution_id) ?? ""}`.toLowerCase().includes(search)) : all;

  const open = rows.filter((o) => o.status === "open");
  const inStage = (s: Stage) => rows.filter((o) => o.stage_id === s.id && (o.status === "open" || s.is_won || s.is_lost));
  const isLate = (o: Opp, s: Stage) => !!s.sla_days && o.status === "open" && daysSince(o.stage_entered_at) > s.sla_days;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const late = open.filter((o) => { const s = stageById.get(o.stage_id); return s && isLate(o, s); });
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost);
  const closedStages = stages.filter((s) => s.is_won || s.is_lost);
  const qs = (p: Record<string, string>) =>
    `/oportunidades?${new URLSearchParams({ producto: product.id, vista: view, ...(mine ? { mias: "1" } : {}), ...(search ? { q: search } : {}), ...p })}`;
  const without = (key: string) => { const u = new URLSearchParams(qs({})); u.delete(key); return `/oportunidades?${u}`; };

  const ownerBadge = (o: Opp) => {
    const p = o.owner_id ? ownerById.get(o.owner_id) : undefined;
    const label = p?.full_name || p?.email || "Sin agente";
    return (
      <span title={label} aria-label={`Agente: ${label}`} className="inline-grid size-7 place-items-center rounded-full bg-primary/15 text-[10px] font-extrabold text-teal-800">
        {p ? initials(p.full_name, p.email) : "—"}
      </span>
    );
  };

  const oppRow = (o: Opp, s: Stage) => {
    const days = daysSince(o.stage_entered_at);
    return (
      <li key={o.id} className={`${ROW} border-t border-border text-sm`}>
        <div className="min-w-0">
          <Link href={`/oportunidades/${o.id}`} className="font-semibold hover:underline">{instName.get(o.institution_id) ?? o.name}</Link>
          <p className="truncate text-xs text-muted-foreground">{o.name}</p>
        </div>
        <div className="flex items-center gap-2 md:block">{ownerBadge(o)}<span className="font-semibold md:hidden">{formatMoney(o.amount, o.currency_code)}</span></div>
        <p className="hidden text-right font-semibold md:block">{formatMoney(o.amount, o.currency_code)}</p>
        <div className="flex items-center gap-2" aria-label={`Probabilidad ${o.probability}%`}>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${o.probability}%` }} /></div>
          <span className="w-9 text-right text-xs text-muted-foreground">{o.probability}%</span>
        </div>
        <p className="text-xs md:text-sm"><span className="text-muted-foreground md:hidden">Cierre </span>{o.expected_close_date ? formatDay(o.expected_close_date) : "—"}</p>
        <p>
          {o.status !== "open" ? null : isLate(o, s) ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{days} días · atrasada</span>
          ) : (
            <span className="text-xs text-muted-foreground">{days} {days === 1 ? "día" : "días"} en la etapa</span>
          )}
        </p>
        <details className="relative md:justify-self-end">
          <summary className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer list-none`}>Mover ▸</summary>
          <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-background p-3 shadow-lg">
            <StageForm opportunityId={o.id} stageId={o.stage_id} stages={stages} compact />
          </div>
        </details>
      </li>
    );
  };

  const empty = !all.length;

  return (
    <div className="space-y-6">
      <div className="on-band page-header space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Oportunidades</h1>
            <p className="text-sm text-muted-foreground">{product.name} · {empty ? "todavía no hay oportunidades" : `${open.length} abiertas`}</p>
          </div>
          <div className="flex gap-2">
            {canImport && <Link href="/oportunidades/importar" className={buttonVariants({ variant: "outline" })}>Importar Excel</Link>}
            <Link href="/oportunidades/nueva" className={buttonVariants()}>+ Nueva oportunidad</Link>
          </div>
        </div>
        <ol aria-label="Resumen del embudo" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
          {stages.map((s, i) => {
            const cards = inStage(s);
            return (
              <li key={s.id}>
                <a href={view === "lista" ? `#etapa-${s.id}` : undefined} className={`block rounded-lg border border-border border-t-[3px] p-3 ${s.is_won || s.is_lost ? "" : "bg-background"} ${i === openStages.length ? "lg:ml-3" : ""}`} style={{ borderTopColor: stageColor(s, i) }}>
                  <p className="text-xs font-semibold text-muted-foreground">{s.name}</p>
                  <p className="text-xl font-extrabold">{cards.length}</p>
                  <p className="truncate text-xs text-muted-foreground">{money(cards)}</p>
                </a>
              </li>
            );
          })}
        </ol>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>Pipeline abierto <b className="text-white">{money(open)}</b></span>
          <span>Ponderado <b className="text-white">{totalsByCurrency(open, (o) => o.currency_code, (o) => (Number(o.amount) * o.probability) / 100)}</b></span>
          <span>Atrasadas <b className="text-amber-300">{late.length}</b></span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Proveedor" className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1 text-sm shadow-sm">
          {(products ?? []).map((p) => (
            <Link key={p.id} href={qs({ producto: p.id })} aria-current={p.id === product.id ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${p.id === product.id ? segOn : segOff}`}>{p.name}</Link>
          ))}
        </nav>
        <nav aria-label="Dueño" className="flex gap-1 rounded-lg border border-border bg-background p-1 text-sm shadow-sm">
          <Link href={without("mias")} aria-current={!mine ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${!mine ? segOn : segOff}`}>Todas</Link>
          <Link href={qs({ mias: "1" })} aria-current={mine ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${mine ? segOn : segOff}`}>Solo mías</Link>
        </nav>
        <form role="search" className="w-full sm:w-64">
          <input type="hidden" name="producto" value={product.id} />
          <input type="hidden" name="vista" value={view} />
          {mine && <input type="hidden" name="mias" value="1" />}
          <input type="search" name="q" defaultValue={search} aria-label="Buscar colegio u oportunidad" placeholder="Buscar colegio u oportunidad" className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
        </form>
        <nav aria-label="Vista" className="ml-auto flex gap-1 rounded-lg border border-border bg-background p-1 text-sm shadow-sm">
          <Link href={qs({ vista: "lista" })} aria-current={view === "lista" ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${view === "lista" ? segOn : segOff}`}>Lista</Link>
          <Link href={qs({ vista: "tablero" })} aria-current={view === "tablero" ? "page" : undefined} className={`rounded-md px-3 py-1.5 ${view === "tablero" ? segOn : segOff}`}>Tablero</Link>
        </nav>
      </div>

      {error && <p role="alert" className="text-sm text-red-700">No se pudieron cargar las oportunidades. Recarga la página.</p>}

      {empty && !error ? (
        <div className="rounded-xl border border-border bg-background px-6 py-10 text-center shadow-sm">
          <p className="text-lg font-bold">{mine ? "No tienes oportunidades" : "Todavía no hay oportunidades"} de {product.name}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Registra la primera o sube tu Excel de seguimiento con «Importar Excel». Cada oportunidad aparecerá en su etapa y podrás moverla cuando avance.</p>
          <div className="mt-4 flex justify-center">
            <Link href="/oportunidades/nueva" className={buttonVariants()}>Registrar la primera</Link>
          </div>
        </div>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">Ninguna oportunidad coincide con «{search}». <Link href={without("q")} className="underline">Quitar búsqueda</Link></p>
      ) : view === "tablero" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s, i) => {
            const cards = inStage(s);
            return (
              <section key={s.id} aria-label={s.name} className="min-w-56 flex-1 space-y-2 rounded-xl border-t-[3px] bg-muted p-3" style={{ borderTopColor: stageColor(s, i) }}>
                <header className="text-sm">
                  <p className="font-semibold">{s.name} <span className="font-normal text-muted-foreground">({cards.length})</span></p>
                  <p className="text-xs text-muted-foreground">{money(cards)}</p>
                </header>
                {cards.map((o) => (
                  <article key={o.id} className={`space-y-1 rounded-lg border border-border bg-background p-3 text-sm shadow-sm ${isLate(o, s) ? "border-l-[3px] border-l-amber-500" : ""}`}>
                    <Link href={`/oportunidades/${o.id}`} className="font-semibold hover:underline">{instName.get(o.institution_id) ?? o.name}</Link>
                    <p className="text-xs text-muted-foreground">{o.name}</p>
                    <div className="flex items-center justify-between"><b>{formatMoney(o.amount, o.currency_code)}</b>{ownerBadge(o)}</div>
                    <p className="text-xs text-muted-foreground">{o.probability}% · Cierre {o.expected_close_date ? formatDay(o.expected_close_date) : "—"}</p>
                    {isLate(o, s) && <p className="text-xs font-medium text-amber-700">Lleva {daysSince(o.stage_entered_at)} días en esta etapa (SLA {s.sla_days})</p>}
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">Mover</summary>
                      <StageForm opportunityId={o.id} stageId={o.stage_id} stages={stages} compact />
                    </details>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background shadow-sm">
          <div className={`${ROW} hidden rounded-t-xl bg-[#f6f8fb] text-xs font-semibold text-muted-foreground md:grid`} aria-hidden>
            <span>Institución · oportunidad</span><span>Agente</span><span className="text-right">Monto</span><span>Probabilidad</span><span>Cierre</span><span>En la etapa</span><span />
          </div>
          {/* Las etapas más cercanas al cierre van primero. */}
          {[...openStages].reverse().map((s) => {
            const items = inStage(s);
            const i = stages.indexOf(s);
            return (
              <details key={s.id} id={`etapa-${s.id}`} open={items.length > 0} className="scroll-mt-4 border-t border-border first-of-type:border-t-0">
                <summary className="flex cursor-pointer items-center gap-2 bg-[#fbfcfe] px-4 py-2.5 text-sm">
                  <span className="size-2 rounded-full" style={{ background: stageColor(s, i) }} />
                  <b>{s.name}</b>
                  <span className="text-xs text-muted-foreground">{items.length} · {money(items)}</span>
                </summary>
                {items.length ? <ul>{items.map((o) => oppRow(o, s))}</ul> : <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Sin oportunidades en esta etapa.</p>}
              </details>
            );
          })}
          {closedStages.map((s) => {
            const items = inStage(s);
            return (
              <details key={s.id} id={`etapa-${s.id}`} className="scroll-mt-4 border-t border-border">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="size-2 rounded-full" style={{ background: stageColor(s, stages.indexOf(s)) }} />
                  <b>{s.name}</b>
                  <span className="text-xs text-muted-foreground">{items.length} · {money(items)}</span>
                </summary>
                {items.length ? <ul>{items.map((o) => oppRow(o, s))}</ul> : <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Ninguna todavía.</p>}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
