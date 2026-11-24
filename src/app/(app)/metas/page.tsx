import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { CURRENCIES } from "@/modules/catalog/labels";
import { createGoal, deleteGoal, repeatGoal, splitGoal } from "@/modules/goals/actions";
import { formatGoalValue, GoalBar, type GoalProgress } from "@/modules/goals/goal-bar";
import { goalMetrics } from "@/modules/goals/labels";
import { dayIn, formatDay } from "@/modules/activities/time";
import { expectedPct, periodKinds } from "@/modules/goals/period";
import { progressPct } from "@/modules/goals/labels";

export default async function GoalsPage() {
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
  const opt = (list: { id: string; name?: string; full_name?: string | null; email?: string }[] | null) => [
    { value: "", label: "Todos" },
    ...(list ?? []).map((x) => ({ value: x.id, label: x.name ?? x.full_name ?? x.email ?? "" })),
  ];

  return (
    <div className="max-w-5xl space-y-8">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Metas</h1>
        <p className="text-sm text-muted-foreground">El avance cuenta ventas ganadas (fecha de cierre) dentro del periodo y del alcance de cada meta.</p>
      </div>

      {goals.error && <p role="alert" className="text-sm text-red-700">No se pudieron cargar las metas. Recarga la página.</p>}
      {!goals.error && rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay metas.</p>}

      <ul className="space-y-5">
        {rows.map((g) => (
          <li key={g.id} className="space-y-2 rounded-xl border border-border bg-background p-4 shadow-sm">
            <GoalBar g={g} />
            {(() => {
              const expected = expectedPct(g.period_start, g.period_end, today);
              if (expected === null) return null;
              const pct = progressPct(Number(g.actual), Number(g.target));
              const ahead = pct >= expected;
              return (
                <p className={`text-xs ${ahead ? "text-emerald-700" : "text-amber-700"}`}>
                  Ritmo: a hoy debería ir en {expected}% · {ahead ? "va adelantada" : `va atrasada ${expected - pct} puntos`}
                </p>
              );
            })()}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {goalMetrics[g.metric]} · {formatDay(g.period_start)} a {formatDay(g.period_end)} · Vendedor: {name(g.owner_id)} · Oficina:{" "}
                {name(g.office_id)} · Producto: {name(g.product_id)}
                {g.team_id && ` · Equipo: ${name(g.team_id)}`}{g.company_id && ` · Empresa: ${name(g.company_id)}`}{g.business_unit_id && ` · Unidad: ${name(g.business_unit_id)}`}
                {parentOf.has(g.id) && ` · Reparto de: ${goalName.get(parentOf.get(g.id)!) ?? "meta general"}`}
                {splitCount(g.id) > 0 && ` · Repartida entre ${splitCount(g.id)} vendedores`}
              </span>
              {canManage.data && (
                <span className="flex gap-3">
                  <form action={repeatGoal}>
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="underline hover:text-foreground">Repetir en el siguiente periodo</button>
                  </form>
                  <form action={deleteGoal}>
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="underline hover:text-foreground">Eliminar</button>
                  </form>
                </span>
              )}
            </div>
            {canManage.data && !g.owner_id && !parentOf.has(g.id) && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground">
                  {splitCount(g.id) > 0 ? "Volver a repartir entre vendedores" : "Repartir entre vendedores"}
                </summary>
                <ActionForm action={splitGoal.bind(null, g.id)} submitLabel="Repartir" className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Marca a los vendedores. Deja los objetivos vacíos para partes iguales, o captura uno por vendedor que sumen {formatGoalValue(Number(g.target), g.currency_code)}.
                    {splitCount(g.id) > 0 && " El reparto anterior se reemplaza."}
                  </p>
                  <fieldset className="grid gap-2 sm:grid-cols-2">
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
          </li>
        ))}
      </ul>

      {canManage.data && (
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Nueva meta</h2>
          <ActionForm action={createGoal} submitLabel="Crear meta" className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Nombre" name="name" placeholder="Venta enero 2027" required />
            <SelectField label="Qué se mide" name="metric" options={Object.entries(goalMetrics).map(([value, label]) => ({ value, label }))} />
            <Field label="Objetivo" name="target" type="number" min="0" step="any" required />
            <SelectField label="Moneda (solo venta y margen)" name="currency_code" options={[{ value: "", label: "—" }, ...CURRENCIES.map((c) => ({ value: c, label: c }))]} />
            <SelectField label="Periodo" name="period_kind" options={Object.entries(periodKinds).map(([value, label]) => ({ value, label }))} />
            <Field label="Desde (o cualquier día del periodo)" name="period_start" type="date" required />
            <Field label="Hasta (solo con fechas a mano)" name="period_end" type="date" />
            <SelectField label="Vendedor" name="owner_id" options={opt(profiles.data)} />
            <SelectField label="Equipo (en lugar de vendedor)" name="team_id" options={[{ value: "", label: "Ninguno" }, ...(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
            <SelectField label="Oficina" name="office_id" options={opt(offices.data)} />
            <SelectField label="Proveedor" name="product_id" options={opt(products.data)} />
            <SelectField label="Empresa" name="company_id" options={opt(companyList)} />
            <SelectField label="Unidad de negocio" name="business_unit_id" options={opt(units.data)} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
