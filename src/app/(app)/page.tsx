import Link from "next/link";
import { SelectField, Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { dayIn } from "@/modules/activities/time";
import { GoalBar, type GoalProgress } from "@/modules/goals/goal-bar";
import { formatMoney } from "@/modules/opportunities/labels";
import { buttonVariants } from "@/components/ui/button";
import { Bars } from "@/components/ui/bars";

type Metrics = {
  currency: string; won_amount: number; won_margin: number; won_units: number; won_count: number; lost_count: number;
  avg_cycle_days: number | null; open_amount: number; open_weighted: number; open_count: number; forecast: number;
  stalled_count: number; unconverted: number; new_institutions: number; activities_done: number; generated_at: string;
  by_product: { name: string; won: number | null; open: number | null; open_count: number }[];
};
type Stage = { stage_id: string; name: string; sort_order: number; reached: number };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Barras horizontales de un solo tono; el valor va escrito, no solo en el largo de la barra.
export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: meId } = await supabase.rpc("current_profile_id");
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle();
  const today = dayIn(new Date(), me?.timezone ?? "America/Mexico_City");
  const from = isDate(sp.desde) ? sp.desde : `${today.slice(0, 7)}-01`;
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const owner = uuid(sp.vendedor), office = uuid(sp.oficina), productId = uuid(sp.producto);

  const [metrics, profiles, offices, products, goals, canExport] = await Promise.all([
    supabase.rpc("dashboard_metrics", { p_from: from, p_to: to, p_owner: owner, p_office: office, p_product: productId }),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("offices").select("id, name").order("name"),
    supabase.from("products").select("id, name, default_pipeline_id").eq("active", true).not("default_pipeline_id", "is", null).order("name"),
    supabase.rpc("goals_progress"),
    supabase.rpc("has_permission", { permission: "reports.export" }),
  ]);
  const product = (products.data ?? []).find((p) => p.id === productId) ?? products.data?.[0];
  const conversion = product
    ? await supabase.rpc("stage_conversion", { p_pipeline: product.default_pipeline_id!, p_from: from, p_to: to, p_owner: owner })
    : { data: [] as Stage[] };

  const m = metrics.data as Metrics | null;
  const money = (v: number | null) => formatMoney(v ?? 0, m?.currency ?? "USD");
  const winRate = m && m.won_count + m.lost_count > 0 ? Math.round((m.won_count / (m.won_count + m.lost_count)) * 100) : null;
  const stages = (conversion.data ?? []) as Stage[];
  const first = stages[0]?.reached ?? 0;
  const activeGoals = ((goals.data ?? []) as GoalProgress[]).filter((g) => g.period_start <= to && g.period_end >= from).slice(0, 5);
  const filters = new URLSearchParams({ desde: from, hasta: to, ...(owner && { vendedor: owner }), ...(office && { oficina: office }), ...(productId && { producto: productId }) });
  const opt = (list: { id: string; name?: string; full_name?: string | null; email?: string }[] | null) => [
    { value: "", label: "Todos" },
    ...(list ?? []).map((x) => ({ value: x.id, label: x.name ?? x.full_name ?? x.email ?? "" })),
  ];

  return (
    <div className="space-y-8">
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="text-sm text-muted-foreground">Cifras de tu cartera visible, en {m?.currency ?? "—"}. <Link href="/mi-dia" className="underline">Ir a Mi día</Link></p>
        </div>
        {canExport.data && (
          <a href={`/reportes/oportunidades?${filters}`} className={buttonVariants({ variant: "outline" })}>Exportar oportunidades (CSV)</a>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <Field label="Desde" name="desde" type="date" defaultValue={from} className="w-40" />
        <Field label="Hasta" name="hasta" type="date" defaultValue={to} className="w-40" />
        <SelectField label="Vendedor" name="vendedor" defaultValue={owner ?? ""} options={opt(profiles.data)} />
        <SelectField label="Oficina" name="oficina" defaultValue={office ?? ""} options={opt(offices.data)} />
        <SelectField label="Producto" name="producto" defaultValue={productId ?? ""} options={opt(products.data)} />
        <button type="submit" className={buttonVariants({ variant: "outline" })}>Aplicar</button>
      </form>

      {metrics.error || !m ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron calcular las métricas. Recarga la página.</p>
      ) : (
        <>
          {m.unconverted > 0 && (
            <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {m.unconverted} oportunidad(es) en otra moneda no tienen tipo de cambio a {m.currency} y no se suman. Agrégalo en Administración.
            </p>
          )}
          <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Tile label="Venta ganada" value={money(m.won_amount)} hint={`${m.won_count} ganadas · ${m.won_units} unidades`} />
            <Tile label="Margen ganado" value={money(m.won_margin)} hint={m.won_amount ? `${Math.round((m.won_margin / m.won_amount) * 100)}% de la venta` : undefined} />
            <Tile label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint={`${m.won_count} ganadas de ${m.won_count + m.lost_count} cerradas`} />
            <Tile label="Ciclo de venta" value={m.avg_cycle_days === null ? "—" : `${m.avg_cycle_days} días`} hint="Promedio de creación a cierre ganado" />
            <Tile label="Pipeline abierto" value={money(m.open_amount)} hint={`${m.open_count} oportunidades`} />
            <Tile label="Pipeline ponderado" value={money(m.open_weighted)} hint="Monto × probabilidad de la etapa" />
            <Tile label="Forecast del periodo" value={money(m.forecast)} hint="Ponderado con cierre estimado en el periodo" />
            <Tile label="Estancadas" value={String(m.stalled_count)} hint="Más días en la etapa que su SLA" />
            <Tile label="Instituciones nuevas" value={String(m.new_institutions)} />
            <Tile label="Actividades realizadas" value={String(m.activities_done)} />
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Venta ganada por producto</h2>
              {m.by_product.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin oportunidades en este filtro.</p>
              ) : (
                <>
                  <Bars label="Venta ganada por producto" rows={m.by_product.map((p) => ({ key: p.name, name: p.name, value: Number(p.won ?? 0), text: money(p.won) }))} />
                  <table className="w-full text-sm [&_td:not(:first-child)]:pl-3 [&_th:not(:first-child)]:pl-3">
                    <caption className="sr-only">Detalle por producto</caption>
                    <thead className="text-muted-foreground"><tr><th className="py-1 text-left font-medium">Producto</th><th className="text-right font-medium">Ganado</th><th className="text-right font-medium">Abierto</th><th className="text-right font-medium">Abiertas</th></tr></thead>
                    <tbody>
                      {m.by_product.map((p) => (
                        <tr key={p.name} className="border-t border-border tabular-nums">
                          <td className="py-1">{p.name}</td><td className="text-right">{money(p.won)}</td><td className="text-right">{money(p.open)}</td><td className="text-right">{p.open_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Conversión por etapa{product ? ` · ${product.name}` : ""}</h2>
              <p className="text-xs text-muted-foreground">Oportunidades creadas en el periodo que llegaron a cada etapa (o más allá).</p>
              {first === 0 ? (
                <p className="text-sm text-muted-foreground">Sin oportunidades creadas en el periodo.</p>
              ) : (
                <Bars label="Conversión por etapa" rows={stages.map((s) => ({ key: s.stage_id, name: s.name, value: Number(s.reached), text: `${s.reached} · ${Math.round((Number(s.reached) / first) * 100)}%` }))} />
              )}
            </section>
          </div>

          <section className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Metas del periodo</h2>
              <Link href="/metas" className="text-sm underline">Ver todas</Link>
            </div>
            {activeGoals.length === 0 ? <p className="text-sm text-muted-foreground">No hay metas que crucen este periodo.</p> : activeGoals.map((g) => <GoalBar key={g.id} g={g} />)}
          </section>

          <p className="text-xs text-muted-foreground">
            Venta y margen usan la fecha de cierre y el tipo de cambio vigente a esa fecha; el pipeline abierto usa la tasa de hoy. Actualizado:{" "}
            {new Date(m.generated_at).toLocaleString("es-MX", { timeZone: me?.timezone ?? "America/Mexico_City" })}
          </p>
        </>
      )}
    </div>
  );
}
