import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/modules/activities/time";
import { createCampaign } from "@/modules/campaigns/actions";
import { campaignStatuses, campaignTypes } from "@/modules/campaigns/schemas";
import { CURRENCIES } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";
import { formatMoney } from "@/modules/opportunities/labels";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const [{ data: campaigns, error }, { data: canManage }, { data: suppliers }, { data: members }] = await Promise.all([
    supabase.from("campaigns").select("id, name, campaign_type, status, start_date, end_date, budget_amount, actual_cost, currency_code, product_id")
      .order("start_date", { ascending: false }),
    supabase.rpc("has_permission", { permission: "campaigns.manage" }),
    supabase.from("products").select("id, name").is("supplier_id", null).eq("active", true).order("name"),
    supabase.from("campaign_members").select("campaign_id"),
  ]);
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const count = (id: string) => (members ?? []).filter((m) => m.campaign_id === id).length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
        <p className="text-sm text-muted-foreground">Arma la audiencia con un segmento, lanza tareas de seguimiento a cada responsable y mide oportunidades, ventas y ROI.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar las campañas. Recarga la página.</p>
      ) : !campaigns?.length ? (
        <p className="text-sm text-muted-foreground">Todavía no hay campañas.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campanas/${c.id}`} className="block rounded-xl border border-border bg-background p-4 shadow-sm hover:bg-muted">
                <p className="text-xs text-muted-foreground">
                  {campaignTypes[c.campaign_type as keyof typeof campaignTypes]} · {campaignStatuses[c.status as keyof typeof campaignStatuses]}
                  {c.product_id && supplierName.get(c.product_id) ? ` · ${supplierName.get(c.product_id)}` : ""}
                </p>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDay(c.start_date)}{c.end_date ? ` – ${formatDay(c.end_date)}` : ""} · {count(c.id)} instituciones · Costo {formatMoney(Number(c.actual_cost), c.currency_code)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <details className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium">Nueva campaña</summary>
          <ActionForm action={createCampaign} submitLabel="Crear campaña" className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Nombre" name="name" placeholder="Regreso a clases 2027" required className="sm:col-span-2" />
            <SelectField label="Tipo" name="campaign_type" options={toOptions(campaignTypes)} />
            <SelectField label="Proveedor" name="product_id" options={[{ value: "", label: "Varios" }, ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
            <Field label="Inicio" name="start_date" type="date" required />
            <Field label="Fin" name="end_date" type="date" />
            <SelectField label="Moneda" name="currency_code" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <Field label="Presupuesto" name="budget_amount" type="number" min={0} step="0.01" defaultValue="0" />
            <TextareaField label="Notas" name="notes" className="sm:col-span-3" />
          </ActionForm>
        </details>
      )}
    </div>
  );
}
