import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { CURRENCIES } from "@/modules/catalog/labels";
import { createGoal, deleteGoal } from "@/modules/goals/actions";
import { GoalBar, type GoalProgress } from "@/modules/goals/goal-bar";
import { goalMetrics } from "@/modules/goals/labels";
import { formatDay } from "@/modules/activities/time";

export default async function GoalsPage() {
  const supabase = await createClient();
  const [goals, canManage, profiles, offices, products] = await Promise.all([
    supabase.rpc("goals_progress"),
    supabase.rpc("has_permission", { permission: "goals.manage" }),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("offices").select("id, name").order("name"),
    supabase.from("products").select("id, name").eq("active", true).is("supplier_id", null).order("name"),
  ]);
  const rows = (goals.data ?? []) as GoalProgress[];
  const names = new Map<string, string>([
    ...(profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.email] as [string, string]),
    ...[...(offices.data ?? []), ...(products.data ?? [])].map((x) => [x.id, x.name] as [string, string]),
  ]);
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {goalMetrics[g.metric]} · {formatDay(g.period_start)} a {formatDay(g.period_end)} · Vendedor: {name(g.owner_id)} · Oficina:{" "}
                {name(g.office_id)} · Producto: {name(g.product_id)}
              </span>
              {canManage.data && (
                <form action={deleteGoal}>
                  <input type="hidden" name="id" value={g.id} />
                  <button type="submit" className="underline hover:text-foreground">Eliminar</button>
                </form>
              )}
            </div>
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
            <Field label="Desde" name="period_start" type="date" required />
            <Field label="Hasta" name="period_end" type="date" required />
            <SelectField label="Vendedor" name="owner_id" options={opt(profiles.data)} />
            <SelectField label="Oficina" name="office_id" options={opt(offices.data)} />
            <SelectField label="Proveedor" name="product_id" options={opt(products.data)} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
