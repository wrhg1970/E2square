import type { ReactNode } from "react";
import Link from "next/link";
import { SelectField, Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { dayIn } from "@/modules/activities/time";
import { GoalBar, formatGoalValue, type GoalProgress } from "@/modules/goals/goal-bar";
import { progressPct } from "@/modules/goals/labels";
import { periodRange, shiftMonths } from "@/modules/goals/period";
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

// Indicador principal sobre la banda azul noche.
function HeroTile({ label, value, hint }: { label: string; value: string; hint: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums whitespace-nowrap xl:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// Indicador secundario dentro de la tira de una sola tarjeta.
function Stat({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Anillo de avance de la meta; el porcentaje va escrito y como progressbar accesible.
function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} viewBox="0 0 128 128" className="size-28 shrink-0">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#2a3a5c" strokeWidth="12" />
      {pct > 0 && <circle cx="64" cy="64" r={r} fill="none" stroke="var(--primary)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(c * Math.min(pct, 100)) / 100} ${c}`} transform="rotate(-90 64 64)" />}
      <text x="64" y="62" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">{pct}%</text>
      <text x="64" y="82" textAnchor="middle" fill="#a5b2c6" fontSize="11">de la meta</text>
    </svg>
  );
}

const presets = [
  { label: "Este mes", kind: "month", months: 1 },
  { label: "Trimestre", kind: "quarter", months: 3 },
  { label: "Año", kind: "year", months: 12 },
] as const;
const chip = "inline-flex h-9 items-center rounded-full border border-border bg-background px-4 text-sm font-medium hover:border-muted-foreground/40";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: meId } = await supabase.rpc("current_profile_id");
  const { data: me } = await supabase.from("profiles").select("timezone, full_name").eq("id", meId).maybeSingle();
  const tz = me?.timezone ?? "America/Mexico_City";
  const today = dayIn(new Date(), tz);
  const from = isDate(sp.desde) ? sp.desde : `${today.slice(0, 7)}-01`;
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const owner = uuid(sp.vendedor), office = uuid(sp.oficina), productId = uuid(sp.producto);
  const preset = presets.find((p) => periodRange(p.kind, today).start === from && to === today);
  const scope = { p_owner: owner, p_office: office, p_product: productId };

  const [metrics, prev, profiles, offices, products, goals, canExport] = await Promise.all([
    supabase.rpc("dashboard_metrics", { p_from: from, p_to: to, ...scope }),
    // Comparación justa: el mismo tramo del periodo anterior (1–24 nov contra 1–24 oct).
    preset ? supabase.rpc("dashboard_metrics", { p_from: shiftMonths(from, preset.months), p_to: shiftMonths(to, preset.months), ...scope }) : null,
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
  const prevWon = (prev?.data as Metrics | null)?.won_amount;
  const delta = prevWon ? Math.round(((Number(m?.won_amount ?? 0) - prevWon) / prevWon) * 100) : null;
  const money = (v: number | null) => formatMoney(v ?? 0, m?.currency ?? "USD");
  const winRate = m && m.won_count + m.lost_count > 0 ? Math.round((m.won_count / (m.won_count + m.lost_count)) * 100) : null;
  const stages = (conversion.data ?? []) as Stage[];
  const first = stages[0]?.reached ?? 0;
  const activeGoals = ((goals.data ?? []) as GoalProgress[]).filter((g) => g.period_start <= to && g.period_end >= from);
  const goal = activeGoals.find((g) => g.metric === "revenue") ?? activeGoals[0];
  const goalPct = goal ? progressPct(Number(goal.actual), Number(goal.target)) : 0;
  const keep = { ...(owner && { vendedor: owner }), ...(office && { oficina: office }), ...(productId && { producto: productId }) };
  const filters = new URLSearchParams({ desde: from, hasta: to, ...keep });
  const presetHref = (kind: (typeof presets)[number]["kind"]) => `/?${new URLSearchParams({ desde: periodRange(kind, today).start, hasta: today, ...keep })}`;
  const opt = (list: { id: string; name?: string; full_name?: string | null; email?: string }[] | null) => [
    { value: "", label: "Todos" },
    ...(list ?? []).map((x) => ({ value: x.id, label: x.name ?? x.full_name ?? x.email ?? "" })),
  ];
  const greeting = new Intl.DateTimeFormat("es-MX", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const firstName = me?.full_name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="on-band page-header space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
            <p className="text-sm text-muted-foreground">
              {firstName ? `Hola, ${firstName} · ` : ""}{greeting} · Cifras en {m?.currency ?? "—"}. <Link href="/mi-dia" className="underline">Ir a Mi día</Link>
            </p>
          </div>
          {canExport.data && (
            <a href={`/reportes/oportunidades?${filters}`} className={buttonVariants({ variant: "outline" })}>Exportar oportunidades (CSV)</a>
          )}
        </div>

        {m && (
          <section aria-label="Indicadores principales" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="flex items-center gap-5 rounded-xl border border-border bg-background p-4 sm:col-span-2 xl:col-span-1">
              {goal ? (
                <>
                  <Ring pct={goalPct} label={`Avance de ${goal.name}`} />
                  <div className="min-w-0 text-sm">
                    <p className="text-xs text-muted-foreground">Meta del periodo</p>
                    <p className="font-semibold">{goal.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatGoalValue(goal.actual, goal.currency_code)} de {formatGoalValue(goal.target, goal.currency_code)}</p>
                    <p className="mt-1 text-xs font-semibold text-teal-300 tabular-nums">
                      {goalPct >= 100 ? "¡Meta cumplida!" : `Faltan ${formatGoalValue(Number(goal.target) - Number(goal.actual), goal.currency_code)}`}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-sm">
                  <p className="font-semibold">Sin meta para este periodo</p>
                  <p className="mt-1 text-xs text-muted-foreground">Define una meta y aquí verás cuánto llevas y cuánto falta.</p>
                  <Link href="/metas" className={`${buttonVariants()} mt-3`}>Definir meta</Link>
                </div>
              )}
            </div>
            <HeroTile
              label="Venta ganada"
              value={money(m.won_amount)}
              hint={<>{m.won_count} ganadas · {m.won_units} unidades{delta !== null && <> · <span className={delta >= 0 ? "font-semibold text-teal-300" : "font-semibold text-red-300"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%</span> vs. periodo anterior</>}</>}
            />
            <HeroTile label="Pipeline abierto" value={money(m.open_amount)} hint={`${m.open_count} oportunidades · ponderado ${money(m.open_weighted)}`} />
            <HeroTile label="Forecast del periodo" value={money(m.forecast)} hint="Lo que probablemente cierra en el periodo" />
          </section>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <nav aria-label="Periodo" className="flex flex-wrap items-center gap-2 self-end">
          {presets.map((p) => (
            <Link key={p.kind} href={presetHref(p.kind)} aria-current={preset === p ? "page" : undefined} className={`${chip} aria-[current=page]:border-band aria-[current=page]:bg-band aria-[current=page]:text-white`}>{p.label}</Link>
          ))}
        </nav>
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
          <section aria-label="Más indicadores" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Margen ganado" value={money(m.won_margin)} hint={m.won_amount ? `${Math.round((m.won_margin / m.won_amount) * 100)}% de la venta` : "—"} />
            <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint={`${m.won_count} de ${m.won_count + m.lost_count} cerradas`} />
            <Stat label="Ciclo de venta" value={m.avg_cycle_days === null ? "—" : `${m.avg_cycle_days} días`} hint="De creación a cierre ganado" />
            <Stat label="Estancadas" value={String(m.stalled_count)} hint={m.stalled_count ? <Link href="/oportunidades" className="font-semibold text-red-700 underline">Revisar</Link> : "Más días en etapa que su SLA"} />
            <Stat label="Instituciones nuevas" value={String(m.new_institutions)} hint="En el periodo" />
            <Stat label="Actividades realizadas" value={String(m.activities_done)} hint="En el periodo" />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Venta ganada por producto</h2>
              {m.by_product.length === 0 ? (
                <Empty title="Todavía no hay ventas en este filtro" text="Cuando cierres una oportunidad como ganada aparecerá aquí, separada por producto." href="/oportunidades" cta="Ir a Oportunidades" />
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
                <Empty title="Sin oportunidades nuevas en el periodo" text="Registra una oportunidad y verás cuántas avanzan en cada etapa." href="/oportunidades/nueva" cta="Nueva oportunidad" />
              ) : (
                <Bars label="Conversión por etapa" rows={stages.map((s) => ({ key: s.stage_id, name: s.name, value: Number(s.reached), text: `${s.reached} · ${Math.round((Number(s.reached) / first) * 100)}%` }))} />
              )}
            </section>
          </div>

          {activeGoals.length > 1 && (
            <section className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">Otras metas del periodo</h2>
                <Link href="/metas" className="text-sm underline">Ver todas</Link>
              </div>
              {activeGoals.filter((g) => g !== goal).slice(0, 4).map((g) => <GoalBar key={g.id} g={g} />)}
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            Venta y margen usan la fecha de cierre y el tipo de cambio vigente a esa fecha; el pipeline abierto usa la tasa de hoy. Actualizado:{" "}
            {new Date(m.generated_at).toLocaleString("es-MX", { timeZone: tz })}
          </p>
        </>
      )}
    </div>
  );
}

function Empty({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1">{text}</p>
      <Link href={href} className={`${buttonVariants({ variant: "outline" })} mt-3`}>{cta}</Link>
    </div>
  );
}
