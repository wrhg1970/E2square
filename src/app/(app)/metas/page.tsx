import Link from "next/link";
import { Target } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { ComboField } from "@/components/ui/combo-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { CURRENCIES } from "@/modules/catalog/labels";
import { createGoal, deleteGoal, repeatGoal, splitGoal } from "@/modules/goals/actions";
import { formatGoalValue, type GoalProgress } from "@/modules/goals/goal-bar";
import { goalMetrics } from "@/modules/goals/labels";
import { dayIn, formatDay } from "@/modules/activities/time";
import { expectedPct, periodKinds } from "@/modules/goals/period";
import { progressPct } from "@/modules/goals/labels";
import { buttonVariants } from "@/components/ui/button";

const views = { vigentes: "Vigentes", proximas: "Próximas", terminadas: "Terminadas", todas: "Todas" } as const;
const ROW = "grid gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_10rem_minmax(0,1.3fr)_8.5rem] md:items-center";

export default async function GoalsPage({ searchParams }: PageProps<"/metas">) {
  const sp = await searchParams;
  const view = typeof sp.ver === "string" && sp.ver in views ? (sp.ver as keyof typeof views) : "vigentes";
  const supabase = await createClient();
  const [goals, canManage, profiles, offices, products, companies, units, { data: meId }, { data: links }, teams, teamMembers] = await Promise.all([
    supabase.rpc("goals_progress"),
    supabase.rpc("has_permission", { permission: "goals.manage" }),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("offices").select("id, name").order("name"),
    supabase.from("products").select("id, name").eq("active", true).is("supplier_id", null).order("name"),
    supabase.from("companies").select("id, legal_name").order("legal_name"),
    supabase.from("business_units").select("id, name").order("name"),
    supabase.rpc("current_profile_id"),
    supabase.from("goals").select("id, parent_id").not("parent_id", "is", null),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("team_members").select("team_id, profile_id"),
  ]);
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle();
  const today = dayIn(new Date(), me?.timezone ?? "America/Mexico_City");
  const companyList = (companies.data ?? []).map((c) => ({ id: c.id, name: c.legal_name }));
  const rows = (goals.data ?? []) as GoalProgress[];
  const names = new Map<string, string>([
    ...(profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.email] as [string, string]),
    ...[...(offices.data ?? []), ...(products.data ?? []), ...companyList, ...(units.data ?? []), ...(teams.data ?? [])].map((x) => [x.id, x.name] as [string, string]),
  ]);
  const parentOf = new Map((links ?? []).map((l) => [l.id, l.parent_id as string]));
  const goalName = new Map(rows.map((g) => [g.id, g.name]));
  const splitCount = (id: string) => [...parentOf.values()].filter((p) => p === id).length;
  const name = (id: string | null) => (id ? names.get(id) ?? "—" : "Todos");
  const phase = (g: GoalProgress) => (g.period_end < today ? "terminadas" : g.period_start > today ? "proximas" : "vigentes");
  const shown = rows.filter((g) => view === "todas" || phase(g) === view);
  const current = rows.filter((g) => phase(g) === "vigentes");
  const pace = (g: GoalProgress) => {
    const expected = expectedPct(g.period_start, g.period_end, today);
    return expected === null ? null : { expected, pct: progressPct(Number(g.actual), Number(g.target)) };
  };
  const ahead = current.filter((g) => { const p = pace(g); return p && p.pct >= p.expected; }).length;
  const done = rows.filter((g) => progressPct(Number(g.actual), Number(g.target)) >= 100).length;
  const scope = (g: GoalProgress) => [
    g.owner_id ? name(g.owner_id) : g.team_id ? `Equipo: ${name(g.team_id)}` : "Todos los vendedores",
    g.office_id && `Oficina: ${name(g.office_id)}`, g.product_id && `Proveedor: ${name(g.product_id)}`,
    g.company_id && `Empresa: ${name(g.company_id)}`, g.business_unit_id && `Unidad: ${name(g.business_unit_id)}`,
    parentOf.has(g.id) && `Reparto de: ${goalName.get(parentOf.get(g.id)!) ?? "meta general"}`,
  ].filter(Boolean).join(" · ");
  const people = (profiles.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email }));
  const opt = (list: { id: string; name?: string; full_name?: string | null; email?: string }[] | null) => [
    { value: "", label: "Todos" },
    ...(list ?? []).map((x) => ({ value: x.id, label: x.name ?? x.full_name ?? x.email ?? "" })),
  ];

  const newGoal = canManage.data && (
    <ActionForm action={createGoal} submitLabel="Crear meta" className="space-y-5">
      <FormBlock title="Qué se mide" cols={4}>
        <Field label="Nombre" name="name" placeholder="Venta enero 2027" required />
        <SelectField label="Qué se mide" name="metric" options={Object.entries(goalMetrics).map(([value, label]) => ({ value, label }))} />
        <Field label="Objetivo" name="target" type="number" min="0" step="any" required />
        <SelectField label="Moneda (solo venta y margen)" name="currency_code" options={[{ value: "", label: "—" }, ...CURRENCIES.map((c) => ({ value: c, label: c }))]} />
      </FormBlock>
      <FormBlock title="Periodo">
        <SelectField label="Periodo" name="period_kind" options={Object.entries(periodKinds).map(([value, label]) => ({ value, label }))} />
        <Field label="Desde (o cualquier día del periodo)" name="period_start" type="date" required />
        <Field label="Hasta (solo con fechas a mano)" name="period_end" type="date" />
      </FormBlock>
      <FormBlock title="A quién aplica (vacío = todos)">
        <ComboField label="Vendedor" name="owner_id" options={people} placeholder="Todos · escribe un nombre" />
        <SelectField label="Equipo (en lugar de vendedor)" name="team_id" options={[{ value: "", label: "Ninguno" }, ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
        <ComboField label="Proveedor" name="product_id" options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))} placeholder="Todos · escribe un proveedor" />
        <SelectField label="Oficina" name="office_id" options={opt(offices.data)} />
        <SelectField label="Empresa" name="company_id" options={opt(companyList)} />
        <SelectField label="Unidad de negocio" name="business_unit_id" options={opt(units.data)} />
      </FormBlock>
    </ActionForm>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metas</h1>
          <p className="text-sm text-muted-foreground">El avance cuenta ventas ganadas (fecha de cierre) dentro del periodo y del alcance de cada meta.</p>
        </div>
        {rows.length > 0 && (
          <div className="on-light grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Vigentes" value={current.length} hint="Su periodo incluye hoy" />
            <StatTile label="Van a buen ritmo" value={ahead} tone={ahead ? "good" : "default"} hint="De las vigentes" />
            <StatTile label="Van atrasadas" value={current.length - ahead} tone={current.length - ahead ? "warn" : "default"} hint="De las vigentes" />
            <StatTile label="Cumplidas" value={done} tone={done ? "good" : "default"} hint="Llegaron al 100%" />
          </div>
        )}
      </div>

      {goals.error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar las metas. Recarga la página.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Target} title="Todavía no hay metas"
          action={newGoal ? <div className="w-full max-w-4xl text-left"><Reveal label="Crear la primera meta" title="Nueva meta">{newGoal}</Reveal></div> : undefined}>
          Define cuánto quieren vender, ganar de margen o cuántas instituciones nuevas abrir en un mes, trimestre o año.
          El avance se calcula solo con las ventas ganadas y te dice si van a buen ritmo.
          {!canManage.data && <p className="mt-3">Pide a tu director que registre las metas del periodo.</p>}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Periodo" items={Object.entries(views).map(([k, label]) => ({
              href: k === "vigentes" ? "/metas" : `/metas?ver=${k}`, current: view === k,
              label: `${label} (${k === "todas" ? rows.length : rows.filter((g) => phase(g) === k).length})`,
            }))} />
          </div>
          {newGoal && <Reveal label="Nueva meta" title="Nueva meta">{newGoal}</Reveal>}

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay metas {views[view].toLowerCase()}. <Link href="/metas?ver=todas" className="underline">Ver todas</Link></p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
              <div className={`${ROW} hidden bg-[#f6f8fb] text-sm font-medium text-muted-foreground md:grid`}>
                <span>Meta</span><span>Periodo</span><span>Avance</span><span>Ritmo</span>
              </div>
              <ul>
                {shown.map((g) => {
                  const pct = progressPct(Number(g.actual), Number(g.target));
                  const p = pace(g);
                  return (
                    <li key={g.id} className="border-t border-border first:border-t-0 md:first:border-t">
                      <details className="group">
                        <summary className={`${ROW} cursor-pointer list-none text-sm hover:bg-[#f8fafc] [&::-webkit-details-marker]:hidden`}>
                          <span className="min-w-0">
                            <span className="block font-semibold">{g.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{goalMetrics[g.metric]} · {scope(g)}</span>
                          </span>
                          <span className="text-xs md:text-sm">{formatDay(g.period_start)} – {formatDay(g.period_end)}</span>
                          <span className="space-y-1">
                            <span role="progressbar" aria-label={`Avance de ${g.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="block h-2 rounded-full bg-muted">
                              <span className={`block h-2 rounded-full ${pct >= 100 ? "bg-teal-600" : "bg-primary"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </span>
                            <span className="block text-xs tabular-nums text-muted-foreground">
                              <b className="text-foreground">{pct}%</b> · {formatGoalValue(g.actual, g.currency_code)} de {formatGoalValue(g.target, g.currency_code)}
                            </span>
                          </span>
                          <span>
                            {pct >= 100 ? <Pill tone="teal">Cumplida</Pill>
                              : !p ? <Pill>{phase(g) === "proximas" ? "Aún no empieza" : "Terminó"}</Pill>
                              : p.pct >= p.expected ? <Pill tone="teal">A buen ritmo</Pill>
                              : <Pill tone="amber">Atrasada {p.expected - p.pct} pts</Pill>}
                          </span>
                        </summary>
                        <div className="space-y-3 border-t border-dashed border-border bg-[#f8fafc] px-4 py-3 text-sm">
                          <p className="text-muted-foreground">
                            {p && `A hoy debería ir en ${p.expected}%. `}Alcance: {scope(g)}.
                            {splitCount(g.id) > 0 && ` Repartida entre ${splitCount(g.id)} vendedores.`}
                          </p>
                          {g.unconverted > 0 && (
                            <p className="text-xs text-amber-700">{g.unconverted} venta(s) sin tipo de cambio a {g.currency_code}: no se suman. Agrega la tasa en Administración.</p>
                          )}
                          {canManage.data && (
                            <div className="flex flex-wrap gap-3">
                              <form action={repeatGoal}>
                                <input type="hidden" name="id" value={g.id} />
                                <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>Repetir en el siguiente periodo</button>
                              </form>
                              <form action={deleteGoal}>
                                <input type="hidden" name="id" value={g.id} />
                                <button type="submit" className={`${buttonVariants({ variant: "ghost", size: "sm" })} text-red-700`}>Eliminar</button>
                              </form>
                            </div>
                          )}
                          {canManage.data && !g.owner_id && !parentOf.has(g.id) && (
                            <details className="rounded-lg border border-border bg-background p-3">
                              <summary className="cursor-pointer font-medium">
                                {splitCount(g.id) > 0 ? "Volver a repartir entre vendedores" : "Repartir entre vendedores"}
                              </summary>
                              <ActionForm action={splitGoal.bind(null, g.id)} submitLabel="Repartir" className="mt-3 space-y-3">
                                <p className="text-xs text-muted-foreground">
                                  Marca a los vendedores. Deja los objetivos vacíos para partes iguales, o captura uno por vendedor que sumen {formatGoalValue(Number(g.target), g.currency_code)}.
                                  {splitCount(g.id) > 0 && " El reparto anterior se reemplaza."}
                                </p>
                                <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  <legend className="sr-only">Vendedores</legend>
                                  {(profiles.data ?? []).map((p) => (
                                    <div key={p.id} className="flex items-center gap-2">
                                      <input type="checkbox" name="owner" value={p.id} id={`split-${g.id}-${p.id}`}
                                        defaultChecked={Boolean(g.team_id) && (teamMembers.data ?? []).some((m) => m.team_id === g.team_id && m.profile_id === p.id)} />
                                      <label htmlFor={`split-${g.id}-${p.id}`} className="flex-1 truncate">{p.full_name || p.email}</label>
                                      <input type="number" name={`target_${p.id}`} min="0" step="any" aria-label={`Objetivo de ${p.full_name || p.email}`}
                                        className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm" />
                                    </div>
                                  ))}
                                </fieldset>
                              </ActionForm>
                            </details>
                          )}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
