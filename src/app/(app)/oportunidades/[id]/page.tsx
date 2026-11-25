import Link from "next/link";
import { aiEnv } from "@/modules/ai/config";
import { BriefPanel } from "@/modules/ai/brief-panel";
import { OpportunityCommissionPanel } from "@/modules/commissions/opportunity-panel";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, ActivityItem, NewActivityForm, type ActivityRow } from "@/modules/activities/activity-panel";
import { stageRequirements } from "@/modules/catalog/labels";
import { addItem, removeItem, setCancelled, updateOpportunity } from "@/modules/opportunities/actions";
import { formatMoney, opportunityStatuses } from "@/modules/opportunities/labels";
import { StageBar } from "@/modules/opportunities/stage-bar";
import { formatDay } from "@/modules/activities/time";
import { Reveal } from "@/components/ui/reveal";
import { buttonVariants } from "@/components/ui/button";
import { daysAgo } from "@/modules/activities/time";
import type { ReactNode } from "react";
import { CalendarClock, History, NotebookText, Package, Pencil, Plus, User, UserRound, type LucideIcon } from "lucide-react";

const tabs = { resumen: "Resumen", productos: "Productos", actividades: "Actividades", documentos: "Documentos", comision: "Comisión", historial: "Historial", datos: "Datos" } as const;
type Tab = keyof typeof tabs;
const card = "rounded-xl border border-border bg-background p-5 shadow-sm";
const chip = "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted";

function Card({ title, icon: Icon, aside, children }: { title: string; icon?: LucideIcon; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`space-y-3 ${card}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <h2 className="flex items-center gap-2 font-semibold">{Icon && <Icon className="size-4 text-primary" aria-hidden />}{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Un dato de la franja superior: siempre visible, sin importar la pestaña (mismo patrón que la ficha de institución).
function Quick({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

const dateTime = (d: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

export default async function OpportunityPage({ params, searchParams }: PageProps<"/oportunidades/[id]">) {
  const { id } = await params;
  const { seccion, nueva } = await searchParams;
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
  const { data: contacts } = contactIds.length ? await supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds) : { data: [] };

  const stageName = new Map((stages.data ?? []).map((s) => [s.id, s.name]));
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  // Productos que se pueden agregar: los activos del proveedor de esta oportunidad; si aún no tiene, el proveedor mismo.
  const supplier = (products.data ?? []).find((p) => p.default_pipeline_id === opp.pipeline_id);
  const offered = (products.data ?? []).filter((p) => p.active && supplier && p.supplier_id === supplier.id);
  const itemOptions = offered.length ? offered : supplier ? [supplier] : [];
  const listPrices = (prices.data ?? []).filter((p) => itemOptions.some((o) => o.id === p.product_id));
  const personName = new Map((owners.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const isOpen = opp.status === "open";
  const primary = (contacts ?? []).find((c) => c.id === opp.primary_contact_id);
  const facts: [string, string][] = [
    ["Responsable", opp.owner_id ? personName.get(opp.owner_id) ?? "—" : "Sin asignar"],
    ["Contacto principal", primary ? `${primary.first_name} ${primary.last_name}`.trim() : "Sin definir"],
    ["Cierre estimado", opp.expected_close_date ? formatDay(opp.expected_close_date) : "Sin fecha"],
    ["Origen", opp.source || "—"],
    ["Competidor", opp.competitor || "—"],
  ];
  const marginPct = Number(opp.amount) > 0 ? Math.round((Number(opp.margin) / Number(opp.amount)) * 100) : null;

  const tab: Tab = typeof seccion === "string" && seccion in tabs ? (seccion as Tab) : "resumen";
  const tabHref = (k: Tab, extra = "") => (k === "resumen" ? `/oportunidades/${id}` : `/oportunidades/${id}?seccion=${k}${extra}`);
  const itemList = items.data ?? [];
  const pending = activities.filter((a) => a.status === "pending");
  const past = activities.filter((a) => a.status !== "pending");
  const counts: Partial<Record<Tab, number>> = { productos: itemList.length, actividades: pending.length, historial: (history.data ?? []).length };
  const hasAmount = itemList.length > 0 && Number(opp.amount) > 0;
  // Qué le falta a cada etapa con los datos de hoy (la base vuelve a validar al mover).
  const missing = (req: string[]) => req.filter((r) => r !== "loss_reason" && !(
    r === "items" ? hasAmount : r === "expected_close_date" ? !!opp.expected_close_date : r === "primary_contact" ? !!opp.primary_contact_id : true
  )).map((r) => stageRequirements[r as keyof typeof stageRequirements] ?? r);
  const ownerName = opp.owner_id ? personName.get(opp.owner_id) : undefined;
  const contactOptions = (contacts ?? []).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`.trim() }));
  const daysToClose = opp.expected_close_date ? -daysAgo(`${opp.expected_close_date}T23:59:59`) : null;
  const programar = (
    <Link href={tabHref("actividades", "&nueva=1")} className={buttonVariants({ size: "sm" })}><Plus className="size-4" aria-hidden />Programar actividad</Link>
  );

  const productsTable = (
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead className="text-muted-foreground">
        <tr>{["Producto", "Cantidad", "Precio", "Desc.", "Total", "Costo", ""].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {itemList.map((it) => (
          <tr key={it.id} className="border-t border-border">
            <td className="py-2 pr-4">{productName.get(it.product_id)}{it.description ? ` · ${it.description}` : ""}</td>
            <td className="py-2 pr-4 tabular-nums">{Number(it.quantity).toLocaleString("es-MX")}</td>
            <td className="py-2 pr-4 tabular-nums">{formatMoney(it.unit_price, opp.currency_code)}</td>
            <td className="py-2 pr-4 tabular-nums">{Number(it.discount_pct)}%</td>
            <td className="py-2 pr-4 tabular-nums">{formatMoney(it.line_total, opp.currency_code)}</td>
            <td className="py-2 pr-4 tabular-nums">{formatMoney(it.line_cost, opp.currency_code)}</td>
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
    </table></div>
  );

  const addProduct = canWrite && isOpen && (
    <Reveal label={`Agregar producto (${opp.currency_code})`} variant={itemList.length ? "outline" : "default"} open={tab === "productos" && !itemList.length}>
      {listPrices.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Precios de lista: {listPrices.map((p) => `${productName.get(p.product_id)} – ${p.name}: ${formatMoney(p.unit_price, p.currency_code)}/${p.unit_name} (costo ${formatMoney(p.unit_cost, p.currency_code)})`).join(" · ")}
        </p>
      )}
      <ActionForm action={addItem.bind(null, id)} submitLabel="Agregar" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
        <SelectField label="Producto" name="product_id" options={[{ value: "", label: "Elige" }, ...itemOptions.map((p) => ({ value: p.id, label: p.name }))]} required />
        <Field label="Cantidad" name="quantity" type="number" step="any" min={0} required />
        <Field label="Precio unitario" name="unit_price" type="number" step="0.01" min={0} required />
        <Field label="Desc. %" name="discount_pct" type="number" step="0.01" min={0} max={100} />
        <Field label="Costo unitario" name="unit_cost" type="number" step="0.01" min={0} />
        <Field label="Descripción" name="description" />
      </ActionForm>
    </Reveal>
  );

  return (
    <div className="max-w-6xl space-y-4">
      <Link href="/oportunidades" className="text-sm text-muted-foreground hover:underline">← Oportunidades</Link>

      <header className="grid items-start gap-4 rounded-2xl bg-band p-6 text-white shadow-lg shadow-band/20 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-primary/20 px-2.5 py-1 text-primary">{opportunityStatuses[opp.status as keyof typeof opportunityStatuses]}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">Probabilidad {opp.probability}%</span>
            {isOpen && !opp.next_activity_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-black"><CalendarClock className="size-3.5" aria-hidden />Sin próxima actividad</span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{opp.name}</h1>
          <p className="mt-1 text-sm opacity-80">
            {inst.data && <Link href={`/instituciones/${inst.data.id}`} className="underline">{inst.data.name}</Link>}
            {supplier && ` · ${supplier.name}`}
          </p>
        </div>
        <dl className="grid w-full grid-cols-3 gap-4 rounded-xl border border-white/15 bg-white/10 px-5 py-4 text-right sm:w-auto">
          <div><dt className="text-xs opacity-70">Venta</dt><dd className="text-lg font-semibold tabular-nums text-primary sm:text-xl">{formatMoney(opp.amount, opp.currency_code)}</dd></div>
          <div><dt className="text-xs opacity-70">Costo</dt><dd className="text-lg font-semibold tabular-nums sm:text-xl">{formatMoney(opp.cost, opp.currency_code)}</dd></div>
          <div><dt className="text-xs opacity-70">Margen</dt><dd className="text-lg font-semibold tabular-nums sm:text-xl">{formatMoney(opp.margin, opp.currency_code)}{marginPct !== null && <span className="ml-1 text-sm font-normal">({marginPct}%)</span>}</dd></div>
        </dl>
      </header>

      {opp.status === "lost" && opp.loss_reason && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Motivo de pérdida: {opp.loss_reason}</p>}

      <section aria-label="Etapa" className={`${card} !py-3`}>
        <StageBar
          opportunityId={id}
          stageId={opp.stage_id}
          canMove={Boolean(canWrite) && opp.status !== "cancelled"}
          stages={(stages.data ?? []).map((s) => ({ id: s.id, name: s.name, is_won: s.is_won, is_lost: s.is_lost, missing: missing(s.required_fields) }))}
        />
      </section>

      <section aria-label="Datos clave" className={`${card} grid gap-x-6 gap-y-3 !py-3 text-sm sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto]`}>
        <Quick icon={UserRound} label="Contacto principal">
          {primary ? (
            <>
              <p className="truncate font-semibold">{`${primary.first_name} ${primary.last_name}`.trim()}</p>
              <p className="truncate text-xs">
                {primary.email && <a href={`mailto:${primary.email}`} className="text-primary hover:underline">{primary.email}</a>}
                {primary.email && primary.phone && " · "}
                {primary.phone && <a href={`tel:${primary.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">{primary.phone}</a>}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground/70">Sin definir {canWrite && <Link href={`${tabHref("datos")}#editar`} className="text-primary underline">Elegir</Link>}</p>
          )}
        </Quick>
        <Quick icon={User} label="Responsable">
          <p className="truncate" title={ownerName}>{ownerName ?? "Sin asignar"}</p>
          <p className="text-xs text-muted-foreground">{opp.last_activity_at ? `Última interacción hace ${daysAgo(opp.last_activity_at)} días` : "Sin interacciones registradas"}</p>
        </Quick>
        <Quick icon={CalendarClock} label="Cierre estimado">
          <p>{opp.expected_close_date ? formatDay(opp.expected_close_date) : <span className="text-muted-foreground/70">Sin fecha</span>}</p>
          {daysToClose !== null && isOpen && (
            <p className={`text-xs ${daysToClose < 0 ? "text-red-700" : daysToClose <= 7 ? "text-amber-700" : "text-muted-foreground"}`}>
              {daysToClose < 0 ? `Vencido hace ${-daysToClose} días` : daysToClose === 0 ? "Hoy" : `Faltan ${daysToClose} días`}
            </p>
          )}
        </Quick>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canWrite && isOpen && <Link href={tabHref("actividades", "&nueva=1")} className={chip}><Plus className="size-4" aria-hidden />Actividad</Link>}
          {canWrite && (
            <Link href={`${tabHref("datos")}#editar`} className={`${chip} border-primary bg-primary font-medium text-primary-foreground hover:bg-primary/90`}>
              <Pencil className="size-4" aria-hidden />Editar
            </Link>
          )}
        </div>
      </section>

      <nav aria-label="Secciones de la ficha" className="flex gap-1 overflow-x-auto border-b border-border text-sm">
        {(Object.keys(tabs) as Tab[]).map((k) => (
          <Link key={k} href={tabHref(k)} aria-current={tab === k ? "page" : undefined} scroll={false}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 ${tab === k ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tabs[k]}
            {counts[k] !== undefined && <span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${tab === k ? "bg-primary/15" : "bg-muted"}`}>{counts[k]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "resumen" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card icon={History} title={`Próximas actividades (${pending.length})`} aside={canWrite && isOpen && programar}>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">{isOpen ? "Sin próxima actividad. Programa la siguiente llamada o visita para no perder el seguimiento." : "Sin actividades pendientes."}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {pending.slice(0, 3).map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={Boolean(canWrite)} />)}
                </ul>
              )}
              {pending.length > 3 && <Link href={tabHref("actividades")} className="text-sm text-primary underline">Ver las {pending.length}</Link>}
            </Card>
            <Card icon={Package} title={`Productos (${itemList.length})`} aside={<Link href={tabHref("productos")} className="text-sm text-primary underline">{itemList.length ? "Ver detalle" : "Agregar"}</Link>}>
              {itemList.length ? (
                <ul className="divide-y divide-border text-sm">
                  {itemList.slice(0, 4).map((it) => (
                    <li key={it.id} className="flex justify-between gap-3 py-2 first:pt-0">
                      <span className="min-w-0 truncate">{productName.get(it.product_id)}{it.description ? ` · ${it.description}` : ""} <span className="text-muted-foreground">× {Number(it.quantity).toLocaleString("es-MX")}</span></span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatMoney(it.line_total, opp.currency_code)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Sin productos. Agrega al menos uno para avanzar a Propuesta: el monto, el costo y el margen se calculan solos.</p>
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <BriefPanel opportunityId={id} enabled={aiEnv() !== null} />
            <Card icon={NotebookText} title="Notas" aside={canWrite && <Link href={`${tabHref("datos")}#editar`} className="text-sm text-primary underline">{opp.notes ? "Editar" : "Agregar"}</Link>}>
              <p className={`whitespace-pre-line text-sm ${opp.notes ? "" : "text-muted-foreground"}`}>{opp.notes || "Sin notas."}</p>
            </Card>
          </div>
        </div>
      )}

      {tab === "productos" && (
        <Card icon={Package} title={`Productos (${itemList.length})`}>
          {itemList.length ? productsTable : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Sin productos. Agrega al menos uno para avanzar a Propuesta: el monto, el costo y el margen se calculan solos.</p>}
          {addProduct}
        </Card>
      )}

      {tab === "actividades" && (
        <Card icon={History} title={`Actividades (${pending.length} ${pending.length === 1 ? "pendiente" : "pendientes"})`}>
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Sin actividades pendientes.</p> : (
            <ul className="divide-y divide-border">
              {pending.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={Boolean(canWrite)} />)}
            </ul>
          )}
          {canWrite && (
            <Reveal label="Registrar o programar actividad" variant={pending.length ? "outline" : "default"} open={nueva === "1"}>
              <NewActivityForm opportunityId={id} contacts={contactOptions} />
            </Reveal>
          )}
          {past.length > 0 && (
            <details open>
              <summary className="cursor-pointer text-sm font-medium">Historial ({past.length})</summary>
              <ul className="mt-2 divide-y divide-border">
                {past.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={false} />)}
              </ul>
            </details>
          )}
        </Card>
      )}

      {tab === "documentos" && (
        <Card title="Documentos"><DocumentsPanel opportunityId={id} canWrite={Boolean(canWrite)} /></Card>
      )}

      {tab === "comision" && (
        <Card title="Comisión"><OpportunityCommissionPanel opp={opp} meId={meId} people={owners.data ?? []} /></Card>
      )}

      {tab === "historial" && (
        <Card icon={History} title="Historial de etapas" aside={canAudit && <Link href={`/administracion/bitacora?registro=${id}&desde=2000-01-01`} className="text-sm text-primary underline">Ver bitácora de cambios</Link>}>
          <ol className="space-y-2 text-sm">
            {(history.data ?? []).map((h) => (
              <li key={h.id}>
                <span className="font-medium">{h.from_stage_id ? `${stageName.get(h.from_stage_id)} → ` : "Creada en "}{stageName.get(h.to_stage_id)}</span>
                <span className="text-muted-foreground"> · {dateTime(h.changed_at)}{h.changed_by ? ` · ${personName.get(h.changed_by) ?? ""}` : ""}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {tab === "datos" && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card title="Datos">
            <dl className="space-y-2 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v}</dd></div>
              ))}
            </dl>
          </Card>
          {canWrite && (
            <section id="editar" className={`scroll-mt-6 space-y-3 ${card}`}>
              <h2 className="font-semibold">Editar datos</h2>
              <ActionForm action={updateOpportunity.bind(null, id)} submitLabel="Guardar" className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre" name="name" defaultValue={opp.name} required className="sm:col-span-2" />
                <Field label="Probabilidad %" name="probability" type="number" min={0} max={100} defaultValue={opp.probability} required />
                <Field label="Cierre estimado" name="expected_close_date" type="date" defaultValue={opp.expected_close_date ?? ""} />
                <SelectField label="Contacto principal" name="primary_contact_id" defaultValue={opp.primary_contact_id ?? ""} options={[{ value: "", label: "Sin definir" }, ...contactOptions]} />
                <SelectField label="Responsable" name="owner_id" defaultValue={opp.owner_id ?? ""} options={(owners.data ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))} />
                <Field label="Origen" name="source" defaultValue={opp.source ?? ""} />
                <Field label="Competidor" name="competitor" defaultValue={opp.competitor ?? ""} />
                <TextareaField label="Notas" name="notes" defaultValue={opp.notes ?? ""} className="sm:col-span-2" />
              </ActionForm>
              <form action={setCancelled.bind(null, id, opp.status !== "cancelled")} className="border-t border-border pt-3">
                <button type="submit" className="text-sm text-muted-foreground underline">
                  {opp.status === "cancelled" ? "Reabrir oportunidad" : "Cancelar oportunidad"}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
