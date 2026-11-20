import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/modules/activities/time";
import { decideCommission, deleteRate, saveRate } from "@/modules/commissions/actions";
import { commissionBases, commissionStatuses } from "@/modules/commissions/labels";
import { formatMoney, totalsByCurrency } from "@/modules/opportunities/labels";

type Status = keyof typeof commissionStatuses;
type Commission = {
  id: string; opportunity_id: string; profile_id: string; product_id: string; basis: keyof typeof commissionBases;
  rate_pct: number; base_amount: number; amount: number; currency_code: string; status: Status;
  decision_note: string | null; created_at: string;
};

const LIMIT = 200; // shortcut: muestra las 200 más recientes por estado; paginar cuando un estado pase de ese volumen.

export default async function CommissionsPage({ searchParams }: PageProps<"/comisiones">) {
  const sp = await searchParams;
  const status: Status | "all" = typeof sp.estado === "string" && (sp.estado in commissionStatuses || sp.estado === "all") ? (sp.estado as Status | "all") : "pending";
  const supabase = await createClient();

  let q = supabase.from("commissions")
    .select("id, opportunity_id, profile_id, product_id, basis, rate_pct, base_amount, amount, currency_code, status, decision_note, created_at")
    .order("created_at", { ascending: false }).limit(LIMIT);
  if (status !== "all") q = q.eq("status", status);

  const [list, rates, canManage, canApprove, meId, profiles, products] = await Promise.all([
    q,
    supabase.from("commission_rates").select("id, profile_id, product_id, rate_pct, basis"),
    supabase.rpc("has_permission", { permission: "commissions.manage" }),
    supabase.rpc("has_permission", { permission: "commissions.approve" }),
    supabase.rpc("current_profile_id"),
    supabase.from("profiles").select("id, full_name, email, status, timezone").order("full_name"),
    supabase.from("products").select("id, name").order("name"),
  ]);
  if (list.error) return <p role="alert" className="text-sm text-red-700">No se pudieron cargar las comisiones. Recarga la página.</p>;

  const rows = (list.data ?? []) as Commission[];
  const oppIds = [...new Set(rows.map((r) => r.opportunity_id))];
  const { data: opps } = oppIds.length ? await supabase.from("opportunities").select("id, name").in("id", oppIds) : { data: [] };
  const oppName = new Map((opps ?? []).map((o) => [o.id, o.name]));
  const person = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  const tz = (profiles.data ?? []).find((p) => p.id === meId.data)?.timezone ?? "America/Mexico_City";
  const total = totalsByCurrency(rows, (r) => r.currency_code, (r) => Number(r.amount));
  const sortedRates = [...(rates.data ?? [])].sort((a, b) =>
    `${person.get(a.profile_id)}${productName.get(a.product_id)}`.localeCompare(`${person.get(b.profile_id)}${productName.get(b.product_id)}`));

  return (
    <div className="max-w-6xl space-y-8">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Comisiones</h1>
        <p className="text-sm text-muted-foreground">
          Se generan al ganar una oportunidad, por cada producto con porcentaje asignado al agente. Las aprueba el director o su superior; nadie aprueba la suya.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Estado">
        {([...Object.entries(commissionStatuses), ["all", "Todas"]] as [string, string][]).map(([key, label]) => (
          <Link key={key} href={`?estado=${key}`} aria-current={status === key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${status === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay comisiones en este estado.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Total: <span className="font-semibold tabular-nums">{total}</span>
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
                      <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(r.created_at, tz)}</td>
                      <td className="py-2 pr-4">{person.get(r.profile_id) ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Link href={`/oportunidades/${r.opportunity_id}`} className="hover:underline">{oppName.get(r.opportunity_id) ?? "Ver"}</Link>
                      </td>
                      <td className="py-2 pr-4">{productName.get(r.product_id) ?? "—"}</td>
                      <td className="whitespace-nowrap py-2 pr-4 tabular-nums">{commissionBases[r.basis]}: {formatMoney(r.base_amount, r.currency_code)}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.rate_pct}%</td>
                      <td className="whitespace-nowrap py-2 pr-4 font-medium tabular-nums">{formatMoney(r.amount, r.currency_code)}</td>
                      <td className="py-2 pr-4">
                        {commissionStatuses[r.status]}
                        {r.decision_note && <p className="text-xs text-muted-foreground">{r.decision_note}</p>}
                      </td>
                      <td className="py-2 pr-4">
                        {canApprove.data && !mine && r.status === "pending" && (
                          <div className="flex flex-col gap-2">
                            <ActionForm action={decideCommission} submitLabel="Aprobar" className="flex items-center gap-2">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="approved" />
                            </ActionForm>
                            <ActionForm action={decideCommission} submitLabel="Rechazar" submitVariant="outline" className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="rejected" />
                              <Field label="Motivo del rechazo" name="note" className="w-48" />
                            </ActionForm>
                          </div>
                        )}
                        {canApprove.data && !mine && r.status === "approved" && (
                          <ActionForm action={decideCommission} submitLabel="Marcar pagada" className="flex items-center gap-2">
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
          <p className="text-sm text-muted-foreground">Todavía no hay porcentajes definidos.</p>
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
                  <td className="py-2 pr-4">{commissionBases[r.basis as keyof typeof commissionBases]}</td>
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
          <ActionForm action={saveRate} submitLabel="Guardar porcentaje" className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <SelectField label="Agente" name="profile_id" options={[{ value: "", label: "Elige un agente" },
              ...(profiles.data ?? []).filter((p) => p.status === "active").map((p) => ({ value: p.id, label: p.full_name || p.email }))]} />
            <SelectField label="Producto" name="product_id" options={[{ value: "", label: "Elige un producto" },
              ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
            <Field label="Porcentaje" name="rate_pct" type="number" min="0.01" max="100" step="0.01" required />
            <SelectField label="Calcular sobre" name="basis" options={Object.entries(commissionBases).map(([value, label]) => ({ value, label }))} />
          </ActionForm>
        )}
      </section>
    </div>
  );
}
