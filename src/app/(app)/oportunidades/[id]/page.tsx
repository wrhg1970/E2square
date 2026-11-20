import Link from "next/link";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, ActivityItem, NewActivityForm, type ActivityRow } from "@/modules/activities/activity-panel";
import { stageRequirements } from "@/modules/catalog/labels";
import { addItem, removeItem, setCancelled, updateOpportunity } from "@/modules/opportunities/actions";
import { formatMoney, opportunityStatuses } from "@/modules/opportunities/labels";
import { StageForm } from "@/modules/opportunities/stage-form";

const dateTime = (d: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

export default async function OpportunityPage({ params }: PageProps<"/oportunidades/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: opp } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!opp) notFound();

  const [inst, stages, items, history, products, prices, links, owners, { data: canWrite }, acts, { data: meId }] = await Promise.all([
    supabase.from("institutions").select("id, name").eq("id", opp.institution_id).maybeSingle(),
    supabase.from("pipeline_stages").select("id, name, sort_order, is_won, is_lost, required_fields").eq("pipeline_id", opp.pipeline_id).order("sort_order"),
    supabase.from("opportunity_items").select("*").eq("opportunity_id", id).order("created_at"),
    supabase.from("opportunity_stage_history").select("id, from_stage_id, to_stage_id, changed_by, changed_at").eq("opportunity_id", id).order("changed_at", { ascending: false }),
    supabase.from("products").select("id, name, active, supplier_id, default_pipeline_id").order("name"),
    supabase.from("price_list_items").select("id, product_id, name, unit_name, unit_price, unit_cost, currency_code").eq("active", true).eq("currency_code", opp.currency_code),
    supabase.from("institution_contacts").select("contact_id").eq("institution_id", opp.institution_id),
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
    supabase.rpc("has_permission", { permission: "institutions.write" }),
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("opportunity_id", id).order("due_at", { ascending: false }).limit(100),
    supabase.rpc("current_profile_id"),
  ]);
  const [{ data: me }, { data: canAudit }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle(),
    supabase.rpc("has_permission", { permission: "audit.read" }),
  ]);
  const tz = me?.timezone ?? "America/Mexico_City";
  const activities = ((acts.data ?? []) as ActivityRow[]).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  const contactIds = (links.data ?? []).map((l) => l.contact_id);
  const { data: contacts } = contactIds.length ? await supabase.from("contacts").select("id, first_name, last_name").in("id", contactIds) : { data: [] };

  const stageName = new Map((stages.data ?? []).map((s) => [s.id, s.name]));
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  // Productos que se pueden agregar: los activos del proveedor de esta oportunidad; si aún no tiene, el proveedor mismo.
  const supplier = (products.data ?? []).find((p) => p.default_pipeline_id === opp.pipeline_id);
  const offered = (products.data ?? []).filter((p) => p.active && supplier && p.supplier_id === supplier.id);
  const itemOptions = offered.length ? offered : supplier ? [supplier] : [];
  const listPrices = (prices.data ?? []).filter((p) => itemOptions.some((o) => o.id === p.product_id));
  const personName = new Map((owners.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const stage = (stages.data ?? []).find((s) => s.id === opp.stage_id);
  const isOpen = opp.status === "open";
  const marginPct = Number(opp.amount) > 0 ? Math.round((Number(opp.margin) / Number(opp.amount)) * 100) : null;

  return (
    <div className="max-w-6xl space-y-6">
      <Link href="/oportunidades" className="text-sm text-muted-foreground underline">Oportunidades</Link>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-band p-6 text-white shadow-lg shadow-band/20">
        <div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white/15 px-2.5 py-1">Etapa: {stage?.name}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">{opportunityStatuses[opp.status as keyof typeof opportunityStatuses]}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">{opp.probability}%</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{opp.name}</h1>
          <p className="mt-1 text-sm opacity-80">
            {inst.data && <Link href={`/instituciones/${inst.data.id}`} className="underline">{inst.data.name}</Link>}
            {opp.owner_id && ` · ${personName.get(opp.owner_id)}`}
            {opp.expected_close_date && ` · Cierre estimado ${opp.expected_close_date}`}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-4 rounded-lg bg-white/10 p-4 text-right">
          <div><dt className="text-xs opacity-70">Venta</dt><dd className="text-xl font-semibold">{formatMoney(opp.amount, opp.currency_code)}</dd></div>
          <div><dt className="text-xs opacity-70">Costo</dt><dd className="text-xl font-semibold">{formatMoney(opp.cost, opp.currency_code)}</dd></div>
          <div><dt className="text-xs opacity-70">Margen</dt><dd className="text-xl font-semibold">{formatMoney(opp.margin, opp.currency_code)}{marginPct !== null && <span className="ml-1 text-sm font-normal">({marginPct}%)</span>}</dd></div>
        </dl>
      </header>

      {opp.status === "lost" && opp.loss_reason && <p className="text-sm">Motivo de pérdida: {opp.loss_reason}</p>}

      {canWrite && opp.status !== "cancelled" && (
        <section className="space-y-2 rounded-xl border border-border bg-background shadow-sm p-5">
          <h2 className="font-semibold">Mover de etapa</h2>
          <StageForm opportunityId={id} stageId={opp.stage_id} stages={stages.data ?? []} />
          <p className="text-xs text-muted-foreground">
            Requisitos por etapa:{" "}
            {(stages.data ?? []).filter((s) => s.required_fields.length).map((s) => `${s.name}: ${s.required_fields.map((r: string) => stageRequirements[r as keyof typeof stageRequirements]).join(", ")}`).join(" · ")}
          </p>
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-5">
        <h2 className="font-semibold">Productos</h2>
        {!items.data?.length ? (
          <p className="text-sm text-muted-foreground">Sin productos. Agrega al menos uno para avanzar a Propuesta.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>{["Producto", "Cantidad", "Precio", "Desc.", "Total", "Costo", ""].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {items.data.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="py-2 pr-4">{productName.get(it.product_id)}{it.description ? ` · ${it.description}` : ""}</td>
                  <td className="py-2 pr-4">{Number(it.quantity).toLocaleString("es-MX")}</td>
                  <td className="py-2 pr-4">{formatMoney(it.unit_price, opp.currency_code)}</td>
                  <td className="py-2 pr-4">{Number(it.discount_pct)}%</td>
                  <td className="py-2 pr-4">{formatMoney(it.line_total, opp.currency_code)}</td>
                  <td className="py-2 pr-4">{formatMoney(it.line_cost, opp.currency_code)}</td>
                  <td className="py-2">
                    {canWrite && isOpen && (
                      <form action={removeItem.bind(null, id, it.id)}>
                        <button type="submit" className="text-xs text-muted-foreground underline">Quitar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canWrite && isOpen && (
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Agregar producto ({opp.currency_code})</summary>
            {listPrices.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Precios de lista: {listPrices.map((p) => `${productName.get(p.product_id)} – ${p.name}: ${formatMoney(p.unit_price, p.currency_code)}/${p.unit_name} (costo ${formatMoney(p.unit_cost, p.currency_code)})`).join(" · ")}
              </p>
            )}
            <ActionForm action={addItem.bind(null, id)} submitLabel="Agregar" className="mt-3 grid gap-3 sm:grid-cols-6 sm:items-end">
              <SelectField label="Producto" name="product_id" options={[{ value: "", label: "Elige" }, ...itemOptions.map((p) => ({ value: p.id, label: p.name }))]} required className="sm:col-span-2" />
              <Field label="Cantidad" name="quantity" type="number" step="any" min={0} required />
              <Field label="Precio unitario" name="unit_price" type="number" step="0.01" min={0} required />
              <Field label="Desc. %" name="discount_pct" type="number" step="0.01" min={0} max={100} />
              <Field label="Costo unitario" name="unit_cost" type="number" step="0.01" min={0} />
              <Field label="Descripción" name="description" className="sm:col-span-6" />
            </ActionForm>
          </details>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-5">
        <h2 className="font-semibold">Actividades</h2>
        {isOpen && !opp.next_activity_at && (
          <p role="alert" className="text-sm font-medium text-amber-700">Esta oportunidad no tiene próxima actividad programada.</p>
        )}
        {activities.length > 0 && (
          <ul className="divide-y divide-border">
            {activities.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={Boolean(canWrite)} />)}
          </ul>
        )}
        {canWrite && (
          <details className="rounded-md border border-border p-3" open={isOpen && !opp.next_activity_at}>
            <summary className="cursor-pointer text-sm font-medium">Registrar o programar actividad</summary>
            <div className="mt-3">
              <NewActivityForm opportunityId={id} contacts={(contacts ?? []).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`.trim() }))} />
            </div>
          </details>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {canWrite && (
          <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-5">
            <h2 className="font-semibold">Datos</h2>
            <ActionForm action={updateOpportunity.bind(null, id)} submitLabel="Guardar" className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" name="name" defaultValue={opp.name} required />
              <Field label="Probabilidad %" name="probability" type="number" min={0} max={100} defaultValue={opp.probability} required />
              <Field label="Cierre estimado" name="expected_close_date" type="date" defaultValue={opp.expected_close_date ?? ""} />
              <SelectField label="Contacto principal" name="primary_contact_id" defaultValue={opp.primary_contact_id ?? ""} options={[{ value: "", label: "Sin definir" }, ...(contacts ?? []).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`.trim() }))]} />
              <SelectField label="Responsable" name="owner_id" defaultValue={opp.owner_id ?? ""} options={(owners.data ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))} />
              <Field label="Origen" name="source" defaultValue={opp.source ?? ""} />
              <Field label="Competidor" name="competitor" defaultValue={opp.competitor ?? ""} />
              <TextareaField label="Notas" name="notes" defaultValue={opp.notes ?? ""} className="sm:col-span-2" />
            </ActionForm>
            <form action={setCancelled.bind(null, id, opp.status !== "cancelled")}>
              <button type="submit" className="text-sm text-muted-foreground underline">
                {opp.status === "cancelled" ? "Reabrir oportunidad" : "Cancelar oportunidad"}
              </button>
            </form>
          </section>
        )}
        <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-5">
          <h2 className="font-semibold">Documentos</h2>
          <DocumentsPanel opportunityId={id} canWrite={Boolean(canWrite)} />
        </section>
        <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Historial de etapas</h2>
            {canAudit && <Link href={`/administracion/bitacora?registro=${id}&desde=2000-01-01`} className="text-sm hover:underline">Ver bitácora de cambios</Link>}
          </div>
          <ol className="space-y-2 text-sm">
            {(history.data ?? []).map((h) => (
              <li key={h.id}>
                <span className="font-medium">{h.from_stage_id ? `${stageName.get(h.from_stage_id)} → ` : "Creada en "}{stageName.get(h.to_stage_id)}</span>
                <span className="text-muted-foreground"> · {dateTime(h.changed_at)}{h.changed_by ? ` · ${personName.get(h.changed_by) ?? ""}` : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
