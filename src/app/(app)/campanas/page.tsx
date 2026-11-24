import Link from "next/link";
import { Megaphone } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/modules/activities/time";
import { createCampaign } from "@/modules/campaigns/actions";
import { campaignStatuses, campaignTone, campaignTypes } from "@/modules/campaigns/schemas";
import { CURRENCIES } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";
import { formatMoney } from "@/modules/opportunities/labels";

export default async function CampaignsPage({ searchParams }: PageProps<"/campanas">) {
  const sp = await searchParams;
  const status = typeof sp.estatus === "string" && sp.estatus in campaignStatuses ? sp.estatus : "";
  const supabase = await createClient();
  const [{ data: all, error }, { data: canManage }, { data: suppliers }, { data: members }] = await Promise.all([
    supabase.from("campaigns").select("id, name, campaign_type, status, start_date, end_date, budget_amount, actual_cost, currency_code, product_id")
      .order("start_date", { ascending: false }),
    supabase.rpc("has_permission", { permission: "campaigns.manage" }),
    supabase.from("products").select("id, name").is("supplier_id", null).eq("active", true).order("name"),
    supabase.from("campaign_members").select("campaign_id"),
  ]);
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const count = (id: string) => (members ?? []).filter((m) => m.campaign_id === id).length;
  const campaigns = (all ?? []).filter((c) => !status || c.status === status);
  const by = (s: string) => (all ?? []).filter((c) => c.status === s).length;

  const newForm = canManage && (
    <ActionForm action={createCampaign} submitLabel="Crear campaña" className="space-y-5">
      <FormBlock title="Qué campaña es">
        <Field label="Nombre" name="name" placeholder="Regreso a clases 2027" required className="lg:col-span-1" />
        <SelectField label="Tipo" name="campaign_type" options={toOptions(campaignTypes)} />
        <SelectField label="Proveedor" name="product_id" options={[{ value: "", label: "Varios" }, ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
      </FormBlock>
      <FormBlock title="Fechas y presupuesto" cols={4}>
        <Field label="Inicio" name="start_date" type="date" required />
        <Field label="Fin" name="end_date" type="date" />
        <SelectField label="Moneda" name="currency_code" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        <Field label="Presupuesto" name="budget_amount" type="number" min={0} step="0.01" defaultValue="0" />
      </FormBlock>
      <TextareaField label="Notas" name="notes" />
    </ActionForm>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
          <p className="text-sm text-muted-foreground">Arma la audiencia con un segmento, lanza tareas de seguimiento a cada responsable y mide oportunidades, ventas y ROI.</p>
        </div>
        {!!all?.length && (
          <div className="on-light grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Activas" value={by("active")} tone={by("active") ? "good" : "default"} />
            <StatTile label="Borradores" value={by("draft")} hint="Sin lanzar todavía" />
            <StatTile label="Terminadas" value={by("finished")} />
            <StatTile label="Instituciones alcanzadas" value={(members ?? []).length} hint="Suma de todas las audiencias" />
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar las campañas. Recarga la página.</p>
      ) : !all?.length ? (
        <EmptyState icon={Megaphone} title="Todavía no hay campañas"
          action={newForm ? <div className="w-full max-w-4xl text-left"><Reveal label="Crear la primera campaña" title="Nueva campaña">{newForm}</Reveal></div> : undefined}>
          Una campaña junta a un grupo de instituciones (por país, tipo, estatus o responsable) y le crea a cada responsable sus tareas de seguimiento.
          Después ves cuántas respondieron, cuántas oportunidades salieron y el ROI.
          {!canManage && <p className="mt-3">Pide a quien administra campañas que cree la primera.</p>}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Estatus" items={[
              { href: "/campanas", label: "Todas", current: !status },
              ...Object.entries(campaignStatuses).map(([k, label]) => ({ href: `/campanas?estatus=${k}`, label, current: status === k })),
            ]} />
          </div>
          {newForm && <Reveal label="Nueva campaña" title="Nueva campaña">{newForm}</Reveal>}
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay campañas con ese estatus. <Link href="/campanas" className="underline">Ver todas</Link></p>
          ) : (
            <div className="table-card">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>{["Campaña", "Estatus", "Tipo", "Fechas", "Audiencia", "Presupuesto", "Costo real"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="relative border-t border-border">
                      <td className="py-2 pr-4">
                        {/* El enlace cubre toda la fila: se abre al tocar cualquier parte. */}
                        <Link href={`/campanas/${c.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{c.name}</Link>
                        {c.product_id && supplierName.get(c.product_id) && <p className="text-xs text-muted-foreground">{supplierName.get(c.product_id)}</p>}
                      </td>
                      <td className="py-2 pr-4"><Pill tone={campaignTone[c.status]}>{campaignStatuses[c.status as keyof typeof campaignStatuses]}</Pill></td>
                      <td className="py-2 pr-4">{campaignTypes[c.campaign_type as keyof typeof campaignTypes]}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{formatDay(c.start_date)}{c.end_date ? ` – ${formatDay(c.end_date)}` : ""}</td>
                      <td className="py-2 pr-4 tabular-nums">{count(c.id)}</td>
                      <td className="whitespace-nowrap py-2 pr-4 tabular-nums">{formatMoney(Number(c.budget_amount), c.currency_code)}</td>
                      <td className="whitespace-nowrap py-2 pr-4 tabular-nums">{formatMoney(Number(c.actual_cost), c.currency_code)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
