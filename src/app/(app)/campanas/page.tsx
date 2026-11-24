import Link from "next/link";
import { Megaphone } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
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
import { progressPct } from "@/modules/goals/labels";

export default async function CampaignsPage({ searchParams }: PageProps<"/campanas">) {
  const sp = await searchParams;
  const view = sp.estatus === "plantillas" ? "plantillas" : "";
  const status = typeof sp.estatus === "string" && sp.estatus in campaignStatuses ? sp.estatus : "";
  const sourceId = typeof sp.nueva === "string" && /^[0-9a-f-]{36}$/i.test(sp.nueva) ? sp.nueva : null;
  const supabase = await createClient();
  const [{ data: everything, error }, { data: canManage }, { data: suppliers }, { data: members }, { data: opps }, { data: steps }] = await Promise.all([
    supabase.from("campaigns").select("id, name, campaign_type, status, start_date, end_date, budget_amount, actual_cost, currency_code, product_id, lead_goal, notes, is_template")
      .order("start_date", { ascending: false }),
    supabase.rpc("has_permission", { permission: "campaigns.manage" }),
    supabase.from("products").select("id, name").is("supplier_id", null).eq("active", true).order("name"),
    supabase.from("campaign_members").select("campaign_id"),
    supabase.from("opportunities").select("source_campaign_id, institution_id").not("source_campaign_id", "is", null),
    supabase.from("campaign_steps").select("campaign_id"),
  ]);
  // Las plantillas no cuentan en cifras ni en la lista de campañas: tienen su propia pestaña.
  const all = (everything ?? []).filter((c) => !c.is_template);
  const templates = (everything ?? []).filter((c) => c.is_template);
  const stepCount = (id: string) => (steps ?? []).filter((st) => st.campaign_id === id).length;
  const source = sourceId ? (everything ?? []).find((c) => c.id === sourceId) : undefined;
  const asTemplate = sp.plantilla === "1";
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const count = (id: string) => (members ?? []).filter((m) => m.campaign_id === id).length;
  // Lead: institución distinta con al menos una oportunidad marcada con la campaña (igual que campaign_results).
  const leads = (id: string) => new Set((opps ?? []).filter((o) => o.source_campaign_id === id).map((o) => o.institution_id)).size;
  const campaigns = all.filter((c) => !status || c.status === status);
  const by = (s: string) => all.filter((c) => c.status === s).length;

  // El mismo formulario sirve para empezar de cero o a partir de una campaña o plantilla (?nueva=<id>).
  const newForm = canManage && (
    <ActionForm key={source?.id ?? "nueva"} action={createCampaign} submitLabel={asTemplate ? "Guardar plantilla" : "Crear campaña"} className="space-y-5">
      {source ? (
        <p className="rounded-lg border border-teal-600/30 bg-teal-50 p-3 text-sm text-teal-900">
          Se copian los datos de abajo{stepCount(source.id) ? `, los ${stepCount(source.id)} pasos de la secuencia` : ""}{!asTemplate && !source.is_template ? " y el segmento de audiencia (lo aplicas con un clic en la nueva campaña)" : ""}.
          No se copian la audiencia, los resultados, las tareas ni el costo real: la nueva {asTemplate ? "plantilla" : "campaña"} nace en borrador.{" "}
          <Link href="/campanas" className="underline">Empezar de cero</Link>
          <input type="hidden" name="source_id" value={source.id} />
        </p>
      ) : templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Partir de una plantilla:</span>
          {templates.map((t) => <Link key={t.id} href={`/campanas?nueva=${t.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>{t.name}</Link>)}
        </div>
      )}
      <FormBlock title={asTemplate ? "Qué plantilla es" : "Qué campaña es"} cols={4}>
        <Field label="Nombre" name="name" placeholder="Regreso a clases 2027" required className="lg:col-span-1"
          defaultValue={source ? (asTemplate ? `Plantilla ${source.name}` : source.name.replace(/^Plantilla\s+/i, "")) : undefined} />
        <SelectField label="Tipo" name="campaign_type" options={toOptions(campaignTypes)} defaultValue={source?.campaign_type} />
        <SelectField label="Proveedor" name="product_id" options={[{ value: "", label: "Varios" }, ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]} defaultValue={source?.product_id ?? ""} />
        <Field label="Meta de leads" name="lead_goal" type="number" min={1} step={1} placeholder="Opcional" defaultValue={source?.lead_goal ?? undefined} />
      </FormBlock>
      <FormBlock title={asTemplate ? "Presupuesto" : "Fechas y presupuesto"} cols={4}>
        {!asTemplate && <Field label="Inicio" name="start_date" type="date" required />}
        {!asTemplate && <Field label="Fin" name="end_date" type="date" />}
        <SelectField label="Moneda" name="currency_code" options={CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={source?.currency_code} />
        <Field label="Presupuesto" name="budget_amount" type="number" min={0} step="0.01" defaultValue={source ? String(source.budget_amount) : "0"} />
      </FormBlock>
      <TextareaField label="Notas" name="notes" defaultValue={source?.notes ?? undefined} />
      {asTemplate ? <input type="hidden" name="is_template" value="on" /> : !source && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="is_template" className="mt-1" />
          <span><span className="font-medium">Guardar como plantilla</span>
            <span className="block text-xs text-muted-foreground">No se lanza ni lleva audiencia; sirve para crear campañas iguales cuando quieras. Las fechas se ignoran.</span></span>
        </label>
      )}
    </ActionForm>
  );
  const formTitle = source ? (asTemplate ? `Nueva plantilla a partir de «${source.name}»` : `Nueva campaña a partir de «${source.name}»`) : "Nueva campaña";

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
          <p className="text-sm text-muted-foreground">Arma la audiencia con un segmento, lanza tareas de seguimiento a cada responsable y mide oportunidades, ventas y ROI.</p>
        </div>
        {!!all.length && (
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
      ) : !all.length && !templates.length ? (
        <EmptyState icon={Megaphone} title="Todavía no hay campañas"
          action={newForm ? <div className="w-full max-w-4xl text-left"><Reveal label="Crear la primera campaña" title={formTitle} open={!!source}>{newForm}</Reveal></div> : undefined}>
          Una campaña junta a un grupo de instituciones (por país, tipo, estatus o responsable) y le crea a cada responsable sus tareas de seguimiento.
          Después ves cuántas respondieron, cuántas oportunidades salieron y el ROI.
          {!canManage && <p className="mt-3">Pide a quien administra campañas que cree la primera.</p>}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Estatus" items={[
              { href: "/campanas", label: "Todas", current: !status && !view },
              ...Object.entries(campaignStatuses).map(([k, label]) => ({ href: `/campanas?estatus=${k}`, label, current: status === k })),
              { href: "/campanas?estatus=plantillas", label: `Plantillas (${templates.length})`, current: view === "plantillas" },
            ]} />
          </div>
          {newForm && <Reveal label="Nueva campaña" title={formTitle} open={!!source}>{newForm}</Reveal>}
          {view === "plantillas" ? (
            templates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                Todavía no hay plantillas. Abre una campaña que te haya funcionado y usa «Guardar como plantilla», o marca la casilla al crear una nueva.
              </p>
            ) : (
              <div className="table-card">
                <table className="w-full text-left text-sm">
                  <thead className="text-muted-foreground">
                    <tr>{["Plantilla", "Tipo", "Pasos", "Meta de leads", "Presupuesto", ""].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {templates.map((t) => (
                      <tr key={t.id} className="relative border-t border-border">
                        <td className="py-2 pr-4">
                          <Link href={`/campanas/${t.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{t.name}</Link>
                          {t.product_id && supplierName.get(t.product_id) && <p className="text-xs text-muted-foreground">{supplierName.get(t.product_id)}</p>}
                        </td>
                        <td className="py-2 pr-4">{campaignTypes[t.campaign_type as keyof typeof campaignTypes]}</td>
                        <td className="py-2 pr-4 tabular-nums">{stepCount(t.id) || "Un seguimiento"}</td>
                        <td className="py-2 pr-4 tabular-nums">{t.lead_goal ?? "—"}</td>
                        <td className="whitespace-nowrap py-2 pr-4 tabular-nums">{formatMoney(Number(t.budget_amount), t.currency_code)}</td>
                        <td className="py-2 text-right">
                          {canManage && <Link href={`/campanas?nueva=${t.id}`} className={`${buttonVariants({ size: "sm" })} relative z-10`}>Usar plantilla</Link>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay campañas con ese estatus. <Link href="/campanas" className="underline">Ver todas</Link></p>
          ) : (
            <div className="table-card">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>{["Campaña", "Estatus", "Tipo", "Fechas", "Audiencia", "Leads", "Presupuesto", "Costo real"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
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
                      <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                        {c.lead_goal ? <>{leads(c.id)} de {c.lead_goal} <span className="text-xs text-muted-foreground">· {progressPct(leads(c.id), c.lead_goal)}%</span></> : leads(c.id)}
                      </td>
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
