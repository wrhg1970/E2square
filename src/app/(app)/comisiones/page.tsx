import Link from "next/link";
import { BadgeDollarSign } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { AutoForm } from "@/components/ui/auto-form";
import { buttonVariants } from "@/components/ui/button";
import { ComboField } from "@/components/ui/combo-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { dayIn, formatDay } from "@/modules/activities/time";
import { decideCommission, deleteRate, saveRate } from "@/modules/commissions/actions";
import { closeGoalTier, saveSettings } from "@/modules/commissions/actions";
import { commissionBases, commissionKinds, commissionStatuses } from "@/modules/commissions/labels";
import { formatTiers } from "@/modules/commissions/schemas";
import { CURRENCIES } from "@/modules/catalog/labels";
import { monthRange } from "@/modules/commissions/period";
import { formatMoney, totalsByCurrency } from "@/modules/opportunities/labels";

type Status = keyof typeof commissionStatuses;
type Commission = {
  id: string; opportunity_id: string | null; profile_id: string; product_id: string | null; basis: keyof typeof commissionBases | null;
  rate_pct: number | null; base_amount: number | null; amount: number; currency_code: string; status: Status;
  kind: keyof typeof commissionKinds; share_pct: number; goal_id: string | null;
  decision_note: string | null; created_at: string;
};

const statusTone: Record<Status, PillTone> = { pending: "amber", approved: "sky", rejected: "red", paid: "teal" };
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const LIMIT = 200; // shortcut: muestra las 200 más recientes por estado; paginar cuando un estado pase de ese volumen.

export default async function CommissionsPage({ searchParams }: PageProps<"/comisiones">) {
  const sp = await searchParams;
  const status: Status | "all" = typeof sp.estado === "string" && (sp.estado in commissionStatuses || sp.estado === "all") ? (sp.estado as Status | "all") : "pending";
  const supabase = await createClient();
  const [meId, profiles] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.from("profiles").select("id, full_name, email, status, timezone").order("full_name"),
  ]);
  const tz = (profiles.data ?? []).find((p) => p.id === meId.data)?.timezone ?? "America/Mexico_City";
  const period = monthRange(sp.mes, tz);

  let q = supabase.from("commissions")
    .select("id, opportunity_id, profile_id, product_id, basis, rate_pct, base_amount, amount, currency_code, status, decision_note, created_at, kind, share_pct, goal_id")
    .gte("created_at", period.from).lt("created_at", period.to)
    .order("created_at", { ascending: false }).limit(LIMIT);
  if (status !== "all") q = q.eq("status", status);

  const [list, month, rates, canManage, canApprove, canExport, products] = await Promise.all([
    q,
    // shortcut: suma en la app hasta 1000 comisiones por mes (límite de la API); pasar a una función SQL si se supera.
    supabase.from("commissions").select("status, currency_code, amount").gte("created_at", period.from).lt("created_at", period.to),
    supabase.from("commission_rates").select("id, profile_id, product_id, rate_pct, basis"),
    supabase.rpc("has_permission", { permission: "commissions.manage" }),
    supabase.rpc("has_permission", { permission: "commissions.approve" }),
    supabase.rpc("has_permission", { permission: "reports.export" }),
    supabase.from("products").select("id, name, supplier_id").order("name"),
  ]);
  const [{ data: settings }, { data: goals }, { data: tiered }] = await Promise.all([
    supabase.from("commission_settings").select("new_institution_bonus, bonus_currency, require_collection, tiers").maybeSingle(),
    supabase.from("goals").select("id, name, owner_id, period_end, metric").in("metric", ["revenue", "margin"]).not("owner_id", "is", null)
      .lt("period_end", dayIn(new Date(), tz)).order("period_end", { ascending: false }).limit(50),
    supabase.from("commissions").select("goal_id").eq("kind", "tier"),
  ]);
  const closedGoals = new Set((tiered ?? []).map((t) => t.goal_id));
  const pendingTiers = (goals ?? []).filter((g) => !closedGoals.has(g.id));
  const cfg = settings ?? { new_institution_bonus: 0, bonus_currency: "MXN", require_collection: true, tiers: [] };
  if (list.error) return <p role="alert" className="text-sm text-red-700">No se pudieron cargar las comisiones. Recarga la página.</p>;

  const rows = (list.data ?? []) as Commission[];
  const oppIds = [...new Set(rows.map((r) => r.opportunity_id).filter(Boolean))] as string[];
  const goalName = new Map((goals ?? []).map((g) => [g.id, g.name]));
  const { data: opps } = oppIds.length ? await supabase.from("opportunities").select("id, name").in("id", oppIds) : { data: [] };
  const oppName = new Map((opps ?? []).map((o) => [o.id, o.name]));
  const person = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const rawName = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.supplier_id ? `${rawName.get(p.supplier_id)} · ${p.name}` : p.name]));
  const totalOf = (st: Status) => {
    const r = (month.data ?? []).filter((c) => c.status === st);
    return r.length ? totalsByCurrency(r, (c) => c.currency_code, (c) => Number(c.amount)) : "—";
  };
  const total = totalsByCurrency(rows, (r) => r.currency_code, (r) => Number(r.amount));
  const thisMonth = dayIn(new Date(), tz).slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period.month}-15T12:00:00Z`));
  const sortedRates = [...(rates.data ?? [])].sort((a, b) =>
    `${person.get(a.profile_id)}${productName.get(a.product_id)}`.localeCompare(`${person.get(b.profile_id)}${productName.get(b.product_id)}`));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Comisiones</h1>
            <p className="text-sm text-muted-foreground">
              Se generan al ganar una oportunidad, por cada producto con porcentaje asignado al agente. Las aprueba el director o su superior; nadie aprueba la suya.
            </p>
          </div>
          {canExport.data && (
            <a href={`/comisiones/exportar?mes=${period.month}&estado=${status}`} className={buttonVariants({ variant: "outline" })}>Exportar CSV</a>
          )}
        </div>
        <section aria-label="Resumen del mes" className="on-light grid gap-3 sm:grid-cols-3">
          <StatTile label="Por aprobar" value={totalOf("pending")} tone={totalOf("pending") !== "—" ? "warn" : "default"} hint={monthLabel} />
          <StatTile label="Aprobadas, por pagar" value={totalOf("approved")} hint={monthLabel} />
          <StatTile label="Pagadas" value={totalOf("paid")} tone={totalOf("paid") !== "—" ? "good" : "default"} hint={monthLabel} />
        </section>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Mes" items={[
          { href: `?estado=${status}&mes=${thisMonth}`, label: "Este mes", current: period.month === thisMonth },
          { href: `?estado=${status}&mes=${shiftMonth(thisMonth, -1)}`, label: "Mes pasado", current: period.month === shiftMonth(thisMonth, -1) },
        ]} />
        <AutoForm className="flex items-end gap-2">
          <input type="hidden" name="estado" value={status} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">Otro mes</span>
            <input type="month" name="mes" defaultValue={period.month} aria-label="Otro mes"
              className="h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm" />
          </label>
          <noscript><button type="submit" className="h-9 rounded-md border border-border px-4 text-sm">Ver mes</button></noscript>
        </AutoForm>
        <Segmented label="Estado" items={([...Object.entries(commissionStatuses), ["all", "Todas"]] as [string, string][]).map(([key, label]) => ({
          href: `?estado=${key}&mes=${period.month}`, label, current: status === key,
        }))} />
      </div>

      {rows.length === 0 ? (
        (month.data ?? []).length === 0 && status === "pending" ? (
          <EmptyState icon={BadgeDollarSign} title={`Sin comisiones en ${monthLabel}`}>
            Las comisiones aparecen solas cuando una oportunidad se marca como ganada y su agente tiene porcentaje para ese producto
            {sortedRates.length === 0 ? ". Todavía no hay porcentajes: defínelos abajo en «Porcentajes por agente y producto»." : "."}
          </EmptyState>
        ) : (
          <p className="text-sm text-muted-foreground">No hay comisiones {status === "all" ? "" : `«${commissionStatuses[status as Status].toLowerCase()}» `}en {monthLabel}.</p>
        )
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {rows.length} {rows.length === 1 ? "comisión" : "comisiones"} · Total: <span className="font-semibold tabular-nums">{total}</span>
          </p>
          <div className="table-card">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  {["Fecha", "Agente", "Oportunidad", "Producto", "Base", "%", "Comisión", "Estado", ""].map((h) => (
                    <th key={h} className="py-2 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const mine = r.profile_id === meId.data;
                  return (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{formatDay(dayIn(new Date(r.created_at), tz))}</td>
                      <td className="py-2 pr-4">{person.get(r.profile_id) ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {r.opportunity_id ? (
                          <Link href={`/oportunidades/${r.opportunity_id}`} className="hover:underline">{oppName.get(r.opportunity_id) ?? "Ver"}</Link>
                        ) : (
                          <Link href="/metas" className="hover:underline">Meta: {goalName.get(r.goal_id ?? "") ?? "ver metas"}</Link>
                        )}
                      </td>
                      <td className="py-2 pr-4">{r.kind === "sale" ? productName.get(r.product_id ?? "") ?? "—" : commissionKinds[r.kind]}</td>
                      <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                        {r.basis && r.base_amount !== null ? `${commissionBases[r.basis]}: ${formatMoney(r.base_amount, r.currency_code)}` : "Monto fijo"}
                        {Number(r.share_pct) < 100 && <span className="block text-xs text-muted-foreground">Reparto: {Number(r.share_pct)}%</span>}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{r.rate_pct !== null ? `${r.rate_pct}%` : "—"}</td>
                      <td className="whitespace-nowrap py-2 pr-4 font-semibold tabular-nums">{formatMoney(r.amount, r.currency_code)}</td>
                      <td className="py-2 pr-4">
                        <Pill tone={statusTone[r.status]}>{commissionStatuses[r.status]}</Pill>
                        {r.decision_note && <p className="mt-1 text-xs text-muted-foreground">{r.decision_note}</p>}
                      </td>
                      <td className="py-2 pr-4">
                        {canApprove.data && !mine && r.status === "pending" && (
                          <div className="flex items-start gap-2">
                            <ActionForm action={decideCommission} submitLabel="Aprobar" className="flex flex-col gap-1">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="approved" />
                            </ActionForm>
                            <details className="relative">
                              <summary className={`${buttonVariants({ variant: "outline" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Rechazar</summary>
                              <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-border bg-background p-3 shadow-lg">
                                <ActionForm action={decideCommission} submitLabel="Confirmar rechazo" submitVariant="outline">
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="status" value="rejected" />
                                  <Field label="Motivo del rechazo" name="note" />
                                </ActionForm>
                              </div>
                            </details>
                          </div>
                        )}
                        {canApprove.data && !mine && r.status === "approved" && (
                          <ActionForm action={decideCommission} submitLabel="Marcar pagada" submitVariant="outline" className="flex flex-col gap-1">
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="status" value="paid" />
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">{canManage.data ? "Porcentajes por agente y producto" : "Mis porcentajes"}</h2>
        {sortedRates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            Todavía no hay porcentajes. Sin porcentaje, ganar una oportunidad no genera comisión.{canManage.data && " Agrega uno por cada agente y producto."}
          </p>
        ) : (
          <div className="table-card"><table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>{["Agente", "Producto", "%", "Sobre", ""].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {sortedRates.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 pr-4">{person.get(r.profile_id)}</td>
                  <td className="py-2 pr-4">{productName.get(r.product_id)}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.rate_pct}%</td>
                  <td className="py-2 pr-4"><Pill tone={r.basis === "margin" ? "violet" : "sky"}>{commissionBases[r.basis as keyof typeof commissionBases]}</Pill></td>
                  <td className="py-2">
                    {canManage.data && (
                      <form action={deleteRate}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-sm underline hover:text-foreground">Quitar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {canManage.data && (
          <Reveal label="Agregar o cambiar porcentaje" variant={sortedRates.length ? "outline" : "default"}>
            <ActionForm action={saveRate} submitLabel="Guardar porcentaje" className="space-y-4">
              <FormBlock title="Porcentaje de comisión" cols={4}>
                <ComboField label="Agente" name="profile_id" required placeholder="Escribe un nombre"
                  options={(profiles.data ?? []).filter((p) => p.status === "active").map((p) => ({ value: p.id, label: p.full_name || p.email }))} />
                <ComboField label="Producto" name="product_id" required placeholder="Escribe un producto"
                  options={(products.data ?? []).map((p) => ({ value: p.id, label: productName.get(p.id)! })).sort((a, b) => a.label.localeCompare(b.label))} />
                <Field label="Porcentaje" name="rate_pct" type="number" min="0.01" max="100" step="0.01" required />
                <SelectField label="Calcular sobre" name="basis" options={Object.entries(commissionBases).map(([value, label]) => ({ value, label }))} />
              </FormBlock>
            </ActionForm>
          </Reveal>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">Bonos, escalones y cobranza</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Bono por institución nueva: {Number(cfg.new_institution_bonus) > 0 ? `${formatMoney(Number(cfg.new_institution_bonus), cfg.bonus_currency)} al responsable cuando la institución gana su primera venta` : "sin bono"}.</li>
          <li>Escalones por meta: {(cfg.tiers as { min_pct: number; extra_pct: number }[]).length
            ? (cfg.tiers as { min_pct: number; extra_pct: number }[]).map((t) => `al ${t.min_pct}% de la meta, +${t.extra_pct}%`).join("; ")
            : "sin escalones"}. Se pagan sobre lo logrado en metas de venta o margen asignadas a un agente.</li>
          <li>Cobranza: {cfg.require_collection ? "la comisión se paga solo cuando el cliente ya pagó (se registra en la oportunidad)" : "se puede pagar sin esperar al cliente"}.</li>
          <li>Reparto: el responsable de la oportunidad puede ceder un porcentaje a otro agente antes de ganarla.</li>
        </ul>
        {canManage.data && (
          <Reveal label="Editar bonos y escalones" variant="outline">
          <ActionForm action={saveSettings} submitLabel="Guardar esquemas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
            <Field label="Bono por institución nueva" name="new_institution_bonus" type="number" min={0} step="0.01" defaultValue={String(cfg.new_institution_bonus)} />
            <SelectField label="Moneda del bono" name="bonus_currency" defaultValue={cfg.bonus_currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <Field label="Escalones (% meta : % extra)" name="tiers" placeholder="100:1, 120:2" defaultValue={formatTiers(cfg.tiers as { min_pct: number; extra_pct: number }[])} />
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="require_collection" defaultChecked={cfg.require_collection} /> Pagar solo si el cliente pagó
            </label>
          </ActionForm>
          </Reveal>
        )}
        {canApprove.data && pendingTiers.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium">Metas terminadas sin escalón calculado</h3>
            <ul className="space-y-2 text-sm">
              {pendingTiers.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3">
                  <span>{g.name} · {person.get(g.owner_id!) ?? "—"} · terminó el {formatDay(g.period_end)}</span>
                  <ActionForm action={closeGoalTier} submitLabel="Calcular escalón" submitVariant="outline" className="flex items-center gap-2">
                    <input type="hidden" name="goal_id" value={g.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
