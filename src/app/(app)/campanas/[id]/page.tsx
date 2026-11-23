import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/modules/activities/time";
import { addMembers, closeCampaign, launchCampaign, removeMember, updateCost } from "@/modules/campaigns/actions";
import { campaignStatuses, campaignTypes, type CampaignResults } from "@/modules/campaigns/schemas";
import { institutionStatuses, institutionTypes, toOptions } from "@/modules/institutions/labels";
import { formatMoney } from "@/modules/opportunities/labels";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function CampaignPage({ params }: PageProps<"/campanas/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: results }, { data: canManage }, { data: members }, { data: owners }] = await Promise.all([
    supabase.rpc("campaign_results", { p_campaign: id }),
    supabase.rpc("has_permission", { permission: "campaigns.manage" }),
    supabase.from("campaign_members").select("id, institution_id, contact_id, consent_basis").eq("campaign_id", id).limit(500),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
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
  const editable = canManage && (c.status === "draft" || c.status === "active");

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header">
        <Link href="/campanas" className="text-sm text-muted-foreground hover:underline">← Campañas</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{c.name}</h1>
        <p className="text-sm text-muted-foreground">
          {campaignTypes[c.campaign_type as keyof typeof campaignTypes]} · {campaignStatuses[c.status as keyof typeof campaignStatuses]} ·{" "}
          {formatDay(c.start_date)}{c.end_date ? ` – ${formatDay(c.end_date)}` : ""} · Presupuesto {money(Number(c.budget_amount))}
        </p>
      </div>

      <section aria-label="Resultados" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Audiencia" value={String(r.members)} hint={`${r.with_consent} con consentimiento`} />
        <Tile label="Respondieron" value={String(r.responded)} hint={`${r.meetings} reuniones o visitas hechas`} />
        <Tile label="Oportunidades" value={String(r.opportunities)} hint={`Abierto ${money(r.open_amount)}`} />
        <Tile label="Ganado" value={money(r.won_amount)} hint={`${r.won_count} ventas · margen ${money(r.won_margin)}`} />
        <Tile label="Costo real" value={money(r.cost)} />
        <Tile label="ROI" value={r.roi_pct === null ? "—" : `${r.roi_pct}%`} hint="(Margen ganado − costo) / costo" />
        <Tile label="Tareas pendientes" value={String(r.tasks_pending)} hint="Seguimientos aún sin hacer" />
      </section>
      {c.launched_at && (
        <p className="text-sm text-green-700">Lanzada el {new Date(c.launched_at).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium" })}: se asignó una tarea de seguimiento al responsable de cada institución.</p>
      )}
      {r.unconverted > 0 && <p className="text-sm text-amber-700">{r.unconverted} oportunidades en otra moneda no tienen tipo de cambio y no se suman.</p>}
      <p className="text-xs text-muted-foreground">
        Cuenta para la campaña toda oportunidad creada marcada con ella (campo &ldquo;Campaña&rdquo; al crear la oportunidad). Respuestas: correos o WhatsApp recibidos de la institución desde el lanzamiento.
      </p>

      {editable && (
        <div className="flex flex-wrap items-start gap-6">
          <ActionForm action={updateCost.bind(null, id)} submitLabel="Guardar costo" className="flex items-end gap-3">
            <Field label="Costo real" name="actual_cost" type="number" min={0} step="0.01" defaultValue={String(c.actual_cost)} />
          </ActionForm>
          {c.status === "draft" ? (
            <ActionForm action={launchCampaign.bind(null, id)} submitLabel="Lanzar campaña">{null}</ActionForm>
          ) : (
            <form action={closeCampaign.bind(null, id, "finished")}>
              <button type="submit" className="h-9 rounded-md border border-border px-4 text-sm">Terminar campaña</button>
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
        <h2 className="text-lg font-semibold">Audiencia ({(members ?? []).length})</h2>
        {editable && (
          <details className="rounded-xl border border-border bg-background p-4 shadow-sm" open={c.status === "draft"}>
            <summary className="cursor-pointer text-sm font-medium">Agregar instituciones por segmento</summary>
            <p className="mt-2 text-xs text-muted-foreground">
              Entran las instituciones que puedes ver y cumplen el segmento. Quedan fuera las inactivas y las que solo tienen contactos que pidieron no ser contactados.
            </p>
            <ActionForm action={addMembers.bind(null, id)} submitLabel="Agregar a la audiencia" className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
              <Field label="País" name="country" placeholder="MX" maxLength={2} />
              <SelectField label="Responsable" name="owner" options={[{ value: "", label: "Todos" }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))]} />
              <SelectField label="Estatus" name="status" options={toOptions(institutionStatuses, "Todos")} />
              <fieldset className="text-sm sm:col-span-4">
                <legend className="font-medium">Tipos (ninguno = todos)</legend>
                <div className="mt-1 flex flex-wrap gap-3">
                  {Object.entries(institutionTypes).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="types" value={k} /> {label}</label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </details>
        )}
        {(members ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin instituciones todavía.</p>
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
                  <td className="py-2 pr-4">{m.consent_basis === "granted" ? "Registrado" : "Sin registrar"}</td>
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
    </div>
  );
}
