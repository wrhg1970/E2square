import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { activityTypes } from "@/modules/activities/labels";
import { formatDay } from "@/modules/activities/time";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { addMembers, addStep, closeCampaign, launchCampaign, removeMember, removeStep, updateCost } from "@/modules/campaigns/actions";
import { campaignStatuses, campaignTone, campaignTypes, type CampaignResults } from "@/modules/campaigns/schemas";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { StatTile as Tile } from "@/components/ui/stat-tile";
import { institutionStatuses, institutionTypes, toOptions } from "@/modules/institutions/labels";
import { formatMoney } from "@/modules/opportunities/labels";
import { progressPct } from "@/modules/goals/labels";

export default async function CampaignPage({ params }: PageProps<"/campanas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: results }, { data: canManage }, { data: members }, { data: owners }, { data: steps }] = await Promise.all([
    supabase.rpc("campaign_results", { p_campaign: id }),
    supabase.rpc("has_permission", { permission: "campaigns.manage" }),
    supabase.from("campaign_members").select("id, institution_id, contact_id, consent_basis").eq("campaign_id", id).limit(500),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("campaign_steps").select("id, day_offset, activity_type, subject").eq("campaign_id", id).order("day_offset").order("created_at"),
  ]);
  const r = results as CampaignResults;
  const instIds = (members ?? []).map((m) => m.institution_id);
  const contactIds = (members ?? []).map((m) => m.contact_id).filter(Boolean) as string[];
  const [{ data: insts }, { data: contacts }] = await Promise.all([
    instIds.length ? supabase.from("institutions").select("id, name, city").in("id", instIds) : Promise.resolve({ data: [] }),
    contactIds.length ? supabase.from("contacts").select("id, first_name, last_name").in("id", contactIds) : Promise.resolve({ data: [] }),
  ]);
  const inst = new Map((insts ?? []).map((i) => [i.id, i]));
  const contact = new Map((contacts ?? []).map((x) => [x.id, `${x.first_name} ${x.last_name}`.trim()]));
  const money = (n: number) => formatMoney(n, c.currency_code);
  const leadPct = r.lead_goal ? progressPct(r.leads, r.lead_goal) : null;
  const editable = canManage && (c.status === "draft" || c.status === "active");

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header">
        <Link href="/campanas" className="text-sm text-muted-foreground hover:underline">← Campañas</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <Pill tone={campaignTone[c.status]}>{campaignStatuses[c.status as keyof typeof campaignStatuses]}</Pill>
        </div>
        <p className="text-sm text-muted-foreground">
          {campaignTypes[c.campaign_type as keyof typeof campaignTypes]} · {formatDay(c.start_date)}{c.end_date ? ` – ${formatDay(c.end_date)}` : ""} · Presupuesto {money(Number(c.budget_amount))}
        </p>
      </div>

      <section aria-label="Resultados" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Audiencia" value={String(r.members)} hint={`${r.with_consent} con consentimiento`} />
        <Tile label="Respondieron" value={String(r.responded)} hint={`${r.meetings} reuniones o visitas hechas`} />
        <Tile label="Leads" value={r.lead_goal ? `${r.leads} de ${r.lead_goal}` : String(r.leads)}
          hint={leadPct === null ? "Sin meta de leads" : `${leadPct}% de la meta`} tone={leadPct !== null && leadPct >= 100 ? "good" : "default"} />
        <Tile label="Oportunidades" value={String(r.opportunities)} hint={`Abierto ${money(r.open_amount)}`} />
        <Tile label="Ganado" value={money(r.won_amount)} hint={`${r.won_count} ventas · margen ${money(r.won_margin)}`} tone={r.won_count ? "good" : "default"} />
        <Tile label="Costo real" value={money(r.cost)} />
        <Tile label="ROI" value={r.roi_pct === null ? "—" : `${r.roi_pct}%`} hint="(Margen ganado − costo) / costo" />
        <Tile label="Tareas pendientes" value={String(r.tasks_pending)} hint="Seguimientos aún sin hacer" tone={r.tasks_pending ? "warn" : "default"} />
      </section>
      {c.launched_at && (
        <p className="text-sm text-green-700">Lanzada el {new Date(c.launched_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium" })}: se asignaron al responsable de cada institución las tareas de la secuencia.</p>
      )}
      {r.unconverted > 0 && <p className="text-sm text-amber-700">{r.unconverted} oportunidades en otra moneda no tienen tipo de cambio y no se suman.</p>}
      <p className="text-xs text-muted-foreground">
        Cuenta para la campaña toda oportunidad creada marcada con ella (campo &ldquo;Campaña&rdquo; al crear la oportunidad). Lead: cada institución que abrió al menos una de esas oportunidades. Respuestas: correos o WhatsApp recibidos de la institución desde el lanzamiento.
      </p>

      {editable && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
          <ActionForm action={updateCost.bind(null, id)} submitLabel="Guardar" submitVariant="outline" className="flex flex-wrap items-end gap-3">
            <Field label="Costo real" name="actual_cost" type="number" min={0} step="0.01" defaultValue={String(c.actual_cost)} />
            <Field label="Meta de leads" name="lead_goal" type="number" min={1} step={1} placeholder="Sin meta" defaultValue={c.lead_goal == null ? "" : String(c.lead_goal)} />
          </ActionForm>
          {c.status === "draft" ? (
            <ActionForm action={launchCampaign.bind(null, id)} submitLabel="Lanzar campaña">{null}</ActionForm>
          ) : (
            <form action={closeCampaign.bind(null, id, "finished")}>
              <button type="submit" className={buttonVariants({ variant: "outline" })}>Terminar campaña</button>
            </form>
          )}
          {c.status === "draft" && (
            <form action={closeCampaign.bind(null, id, "cancelled")}>
              <button type="submit" className="h-9 rounded-md px-4 text-sm text-red-700 underline">Cancelar campaña</button>
            </form>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Secuencia</h2>
        <p className="text-xs text-muted-foreground">
          Al lanzar, cada paso se vuelve una tarea para el responsable de cada institución, el día indicado desde el inicio. No envía mensajes.
          Si la institución abre una oportunidad de esta campaña, se cancelan sus pasos pendientes. Sin pasos, se asigna un solo seguimiento el día de inicio.
        </p>
        {(steps ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            Sin pasos: al lanzar se asigna un solo seguimiento el día de inicio.{canManage && c.status === "draft" && " Agrega pasos si quieres una secuencia (por ejemplo: día 0 correo, día 3 llamada, día 10 visita)."}
          </p>
        ) : (
          <div className="table-card">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground"><tr><th className="w-24 py-2 pr-4 font-medium">Día</th><th className="py-2 pr-4 font-medium">Tipo</th><th className="py-2 pr-4 font-medium">Qué hacer</th><th /></tr></thead>
              <tbody>
                {(steps ?? []).map((st) => (
                  <tr key={st.id} className="border-t border-border">
                    <td className="py-2 pr-4 tabular-nums">Día {st.day_offset}</td>
                    <td className="py-2 pr-4"><Pill tone="sky">{activityTypes[st.activity_type as keyof typeof activityTypes]}</Pill></td>
                    <td className="py-2 pr-4">{st.subject}</td>
                    <td className="py-2 text-right">
                      {canManage && c.status === "draft" && (
                        <form action={removeStep.bind(null, id, st.id)}><button type="submit" className="text-red-700 underline" aria-label={`Quitar paso ${st.subject}`}>Quitar</button></form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage && c.status === "draft" && (steps ?? []).length < 10 && (
          <Reveal label="Agregar paso" variant="outline">
            <ActionForm action={addStep.bind(null, id)} submitLabel="Agregar paso" className="space-y-4">
              <FormBlock title="Paso de la secuencia">
                <Field label="Día" name="day_offset" type="number" min={0} max={365} step={1} defaultValue="0" required />
                <SelectField label="Tipo de paso" name="activity_type" options={Object.entries(activityTypes).map(([value, label]) => ({ value, label }))} />
                <Field label="Qué hacer" name="subject" placeholder="Enviar folleto" required />
              </FormBlock>
            </ActionForm>
          </Reveal>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Audiencia ({(members ?? []).length})</h2>
        {editable && (
          <Reveal label="Agregar instituciones por segmento" variant={(members ?? []).length ? "outline" : "default"} open={c.status === "draft" && (members ?? []).length === 0}>
            <p className="mb-4 text-xs text-muted-foreground">
              Entran las instituciones que puedes ver y cumplen el segmento. Quedan fuera las inactivas y las que solo tienen contactos que pidieron no ser contactados.
            </p>
            <ActionForm action={addMembers.bind(null, id)} submitLabel="Agregar a la audiencia" className="space-y-4">
              <FormBlock title="Segmento">
                <Field label="País" name="country" placeholder="MX" maxLength={2} />
                <SelectField label="Responsable" name="owner" options={[{ value: "", label: "Todos" }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))]} />
                <SelectField label="Estatus" name="status" options={toOptions(institutionStatuses, "Todos")} />
              </FormBlock>
              <fieldset className="text-sm">
                <legend className="font-medium">Tipos (ninguno = todos)</legend>
                <div className="mt-1 flex flex-wrap gap-3">
                  {Object.entries(institutionTypes).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="types" value={k} /> {label}</label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </Reveal>
        )}
        {(members ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            Sin instituciones todavía.{editable && " Usa «Agregar instituciones por segmento» para armar la audiencia antes de lanzar."}
          </p>
        ) : (
          <div className="table-card"><table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr><th className="py-2 pr-4 font-medium">Institución</th><th className="py-2 pr-4 font-medium">Contacto</th><th className="py-2 pr-4 font-medium">Consentimiento</th><th /></tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-2 pr-4">
                    <Link href={`/instituciones/${m.institution_id}`} className="hover:underline">{inst.get(m.institution_id)?.name ?? "—"}</Link>
                    {inst.get(m.institution_id)?.city && <span className="text-muted-foreground"> · {inst.get(m.institution_id)?.city}</span>}
                  </td>
                  <td className="py-2 pr-4">{m.contact_id ? contact.get(m.contact_id) ?? "—" : "Sin contacto"}</td>
                  <td className="py-2 pr-4">{m.consent_basis === "granted" ? <Pill tone="teal">Registrado</Pill> : <Pill>Sin registrar</Pill>}</td>
                  <td className="py-2 text-right">
                    {canManage && c.status === "draft" && (
                      <form action={removeMember.bind(null, id, m.id)}><button type="submit" className="text-red-700 underline">Quitar</button></form>
                    )}
                    {c.status === "active" && (
                      <Link href={`/oportunidades/nueva?institucion=${m.institution_id}&campana=${id}`} className="underline">Crear oportunidad</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Documentos</h2>
        <DocumentsPanel campaignId={id} canWrite={Boolean(canManage)} />
      </section>
    </div>
  );
}
