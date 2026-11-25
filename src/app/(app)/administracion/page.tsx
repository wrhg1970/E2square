import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { ComboField } from "@/components/ui/combo-field";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { scoreFactors } from "@/modules/institutions/scoring";
import { addExchangeRate, deleteStageAutomation, saveAutomation, saveStageAutomation, updateScoreWeights, createBusinessUnit, createCompany, createInvitation, createOffice, createTeam, removeTeamMember, setTeamMember, updateOrgSettings } from "@/modules/admin/actions";
import { automationRules } from "@/modules/admin/schemas";
import { CURRENCIES } from "@/modules/catalog/labels";
import { formatDateTime, formatDay } from "@/modules/activities/time";
import { activityTypes } from "@/modules/activities/labels";
import { googleEnv } from "@/modules/google/config";
import { whatsappEnv } from "@/modules/whatsapp/config";
import { aiEnv, providerLabel } from "@/modules/ai/config";

type IntegrationStatus = {
  google: { user: string; google_email: string; connected_at: string; last_sync_at: string | null }[];
  whatsapp: { display_phone: string; last_event_at: string | null }[];
  whatsapp_failed_7d: number; whatsapp_stuck: number;
  last_errors: { sent_at: string; to_phone: string; error: string | null }[];
};
const STALE_DAYS = 7;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);
const Ok = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={ok ? "text-green-700" : "text-amber-700"}>{ok ? "✓" : "!"} {children}</span>
);
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// Una pestaña a la vez: lo que se busca queda arriba sin desplazarse por toda la página.
const tabs = { usuarios: "Usuarios", equipos: "Equipos", estructura: "Empresas y oficinas", reglas: "Reglas y automatizaciones", cambio: "Tipos de cambio", integraciones: "Integraciones" } as const;

function Table({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="table-card"><table className="w-full text-left text-sm">
      <thead className="text-muted-foreground">
        <tr>{headers.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => <td key={j} className="py-2 pr-4">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

export default async function AdminPage({ searchParams }: PageProps<"/administracion">) {
  const sp = await searchParams;
  const tab = typeof sp.seccion === "string" && sp.seccion in tabs ? (sp.seccion as keyof typeof tabs) : "usuarios";
  const supabase = await createClient();
  const [companies, units, offices, profiles, roles, profileRoles, invitations, canStructure, canUsers, org, rates, automations, teams, teamMembers, stageRules, stages, pipelines, products] = await Promise.all([
    supabase.from("companies").select("id, legal_name, tax_id, country_code, status").order("legal_name"),
    supabase.from("business_units").select("id, name, company_id").order("name"),
    supabase.from("offices").select("id, name, company_id, business_unit_id, country_code, timezone").order("name"),
    supabase.from("profiles").select("id, full_name, email, status").order("email"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("profile_roles").select("profile_id, role_id"),
    supabase.from("invitations").select("id, email, role_id, accepted_at").order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { permission: "admin.structure" }),
    supabase.rpc("has_permission", { permission: "admin.users" }),
    supabase.from("organizations").select("require_next_activity, reporting_currency, score_weights").maybeSingle(),
    supabase.from("exchange_rates").select("id, base_currency, quote_currency, rate, effective_at").order("effective_at", { ascending: false }).limit(50),
    supabase.from("automation_rules").select("key, enabled, days"),
    supabase.from("teams").select("id, name, leader_id").order("name"),
    supabase.from("team_members").select("team_id, profile_id"),
    supabase.from("stage_automation_rules").select("id, stage_id, activity_type, subject, days, enabled").order("created_at"),
    supabase.from("pipeline_stages").select("id, name, pipeline_id, sort_order").order("sort_order"),
    supabase.from("pipelines").select("id, name, product_id, active"),
    supabase.from("products").select("id, name"),
  ]);
  const [{ data: meId }, status] = canStructure.data
    ? await Promise.all([supabase.rpc("current_profile_id"), supabase.rpc("integration_status")])
    : [{ data: null }, { data: null }];
  const { data: me } = meId ? await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle() : { data: null };
  const tz = me?.timezone ?? "America/Mexico_City";
  const integ = status.data as IntegrationStatus | null;
  const ai = aiEnv();

  if (companies.error) {
    return <p role="alert" className="text-sm text-red-700">No se pudo cargar la administración. Recarga la página.</p>;
  }

  const weights = (org.data?.score_weights ?? {}) as Record<string, number>;
  const companyName = new Map((companies.data ?? []).map((c) => [c.id, c.legal_name]));
  const unitName = new Map((units.data ?? []).map((u) => [u.id, u.name]));
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]));
  const personName = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const personOptions = (profiles.data ?? []).filter((p) => p.status === "active").map((p) => ({ value: p.id, label: p.full_name || p.email }));
  const companyOptions = [{ value: "", label: "Elige una empresa" }, ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.legal_name }))];
  const roleOptions = [{ value: "", label: "Elige un rol" }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))];

  // Cada producto tiene su pipeline: "Producto · Etapa" identifica la etapa sin ambigüedad.
  const productName = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  const pipelineLabel = new Map((pipelines.data ?? []).map((p) => [p.id, (p.product_id && productName.get(p.product_id)) || p.name]));
  const activePipelines = new Set((pipelines.data ?? []).filter((p) => p.active).map((p) => p.id));
  const stageLabel = new Map((stages.data ?? []).map((st) => [st.id, `${pipelineLabel.get(st.pipeline_id) ?? "Pipeline"} · ${st.name}`]));
  const stageOptions = [
    { value: "", label: "Elige producto y etapa" },
    ...(stages.data ?? [])
      .filter((st) => activePipelines.has(st.pipeline_id))
      .map((st) => ({ value: st.id, label: stageLabel.get(st.id) ?? st.name, group: pipelineLabel.get(st.pipeline_id) ?? "Pipeline" }))
      .sort((a, b) => a.group.localeCompare(b.group, "es")),
  ];
  const typeOptions = Object.entries(activityTypes).map(([value, label]) => ({ value, label }));
  const stageRuleFields = (r?: NonNullable<typeof stageRules.data>[number]) => (
    <>
      <input type="hidden" name="id" value={r?.id ?? ""} />
      <SelectField label="Cuando la oportunidad entra a" name="stage_id" required defaultValue={r?.stage_id ?? ""} options={stageOptions} />
      <SelectField label="Crear tarea de tipo" name="activity_type" defaultValue={r?.activity_type ?? "follow_up"} options={typeOptions} />
      <Field label="Asunto" name="subject" required maxLength={120} defaultValue={r?.subject ?? ""} placeholder="Ej. Seguimiento a la propuesta" />
      <Field label="Vence en (días)" name="days" type="number" min="0" max="90" required defaultValue={r?.days ?? 1} />
      <label className="flex h-9 items-center gap-2 self-end text-sm">
        <input type="checkbox" name="enabled" defaultChecked={r?.enabled ?? true} /> Activa
      </label>
    </>
  );

  const activeUsers = (profiles.data ?? []).filter((p) => p.status === "active").length;
  const pendingInvites = (invitations.data ?? []).filter((i) => !i.accepted_at).length;
  const warnings = integ ? [googleEnv() !== null, integ.whatsapp.length > 0, whatsappEnv() !== null, ai !== null].filter((ok) => !ok).length
    + (integ.whatsapp_failed_7d > 0 ? 1 : 0) : 0;
  const visibleTabs = (Object.keys(tabs) as (keyof typeof tabs)[]).filter((k) => k !== "integraciones" || integ)
    .filter((k) => k !== "reglas" || (canStructure.data && org.data));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
            <p className="text-sm text-muted-foreground">Usuarios, equipos, estructura de la empresa y reglas del CRM.</p>
          </div>
          <Link href="/administracion/bitacora" className={buttonVariants({ variant: "outline" })}>Bitácora de auditoría</Link>
        </div>
        <div className="on-light grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Usuarios activos" value={activeUsers} hint={`${(profiles.data ?? []).length - activeUsers} inactivos`} />
          <StatTile label="Invitaciones pendientes" value={pendingInvites} tone={pendingInvites ? "warn" : "default"} />
          <StatTile label="Equipos" value={(teams.data ?? []).length} />
          <StatTile label="Avisos de integraciones" value={integ ? warnings : "—"} tone={warnings ? "warn" : "good"} hint={integ ? (warnings ? "Revisa la pestaña Integraciones" : "Todo configurado") : undefined} />
        </div>
      </div>

      <Segmented label="Secciones" items={visibleTabs.map((k) => ({ href: k === "usuarios" ? "/administracion" : `/administracion?seccion=${k}`, label: tabs[k], current: tab === k }))} />

      {tab === "integraciones" && integ && (
        <Section title="Estado de integraciones">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li><Ok ok={googleEnv() !== null}>Google (Gmail y Calendar): {googleEnv() ? "configurado en el servidor" : "faltan las credenciales en el servidor"}</Ok></li>
            <li><Ok ok={integ.whatsapp.length > 0}>WhatsApp: {integ.whatsapp.length ? integ.whatsapp.map((w) => `${w.display_phone} (${w.last_event_at ? `último aviso ${formatDateTime(w.last_event_at, tz)}` : "sin avisos todavía"})`).join(", ") : "ningún número conectado"}</Ok></li>
            <li><Ok ok={whatsappEnv() !== null}>Envío de WhatsApp: {whatsappEnv() ? "token registrado" : "falta el token de Meta en el servidor"}</Ok></li>
            {(integ.whatsapp_failed_7d > 0 || integ.whatsapp_stuck > 0) && (
              <li><Ok ok={false}>{integ.whatsapp_failed_7d} WhatsApp fallidos en 7 días{integ.whatsapp_stuck > 0 ? ` · ${integ.whatsapp_stuck} sin confirmar` : ""}</Ok></li>
            )}
            <li><Ok ok={ai !== null}>IA: {ai ? `activa con ${providerLabel[ai.AI_PROVIDER]}` : "sin configurar"}</Ok></li>
          </ul>
          <Table
            headers={["Usuario", "Cuenta de Google", "Última sincronización de Gmail"]}
            empty="Nadie ha conectado su cuenta de Google todavía."
            rows={integ.google.map((g) => {
              const d = daysSince(g.last_sync_at);
              return [g.user, g.google_email,
                <Ok key="s" ok={d !== null && d < STALE_DAYS}>{g.last_sync_at ? `${formatDateTime(g.last_sync_at, tz)}${d !== null && d >= STALE_DAYS ? ` (hace ${d} días)` : ""}` : "Nunca"}</Ok>];
            })}
          />
          {integ.last_errors.length > 0 && (
            <Table headers={["Fecha", "Para", "Error de WhatsApp"]} empty=""
              rows={integ.last_errors.map((e) => [formatDateTime(e.sent_at, tz), e.to_phone, e.error ?? "—"])} />
          )}
        </Section>
      )}

      {tab === "reglas" && canStructure.data && org.data && (
        <div className="space-y-8">
          <Section title="Reglas comerciales">
            <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
              <ActionForm action={updateOrgSettings} submitLabel="Guardar">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="require_next_activity" defaultChecked={org.data.require_next_activity} />
                  Exigir próxima actividad: no se puede cerrar la última actividad pendiente de una oportunidad abierta sin programar otra
                </label>
                <SelectField label="Moneda de reporte (dashboard y metas)" name="reporting_currency" defaultValue={org.data.reporting_currency}
                  options={currencyOptions} className="max-w-xs" />
              </ActionForm>
            </div>
          </Section>

          <Section title="Puntaje de instituciones" hint="Peso de cada factor (0 a 100). El puntaje es el promedio ponderado, de 0 a 100, y cada ficha muestra cómo se calculó.">
            <div className="rounded-xl border border-border bg-background p-5 shadow-sm">
              <ActionForm action={updateScoreWeights} submitLabel="Guardar pesos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
                {Object.entries(scoreFactors).map(([key, label]) => (
                  <Field key={key} label={label} name={key} type="number" min="0" max="100" step="1" required
                    defaultValue={weights[key] ?? 0} />
                ))}
              </ActionForm>
            </div>
          </Section>

          <Section title="Automatizaciones" hint="Crean tareas internas para el dueño de la oportunidad; nunca envían mensajes. Toca una regla para cambiarla.">
            <ul className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
              {Object.entries(automationRules).map(([key, rule]) => {
                const current = (automations.data ?? []).find((a) => a.key === key);
                return (
                  <li key={key} className="border-t border-border first:border-t-0">
                    <details>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-[#f8fafc] [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1"><span className="font-semibold">{rule.title}</span> <span className="text-muted-foreground">· {rule.when}</span></span>
                        {current?.enabled ? <Pill tone="teal">Activa · vence en {current.days} {current.days === 1 ? "día" : "días"}</Pill> : <Pill>Apagada</Pill>}
                      </summary>
                      <div className="border-t border-dashed border-border bg-[#f8fafc] px-4 py-3">
                        <ActionForm action={saveAutomation} submitLabel="Guardar" className="flex flex-wrap items-end gap-4">
                          <input type="hidden" name="key" value={key} />
                          <label className="flex h-9 items-center gap-2 text-sm">
                            <input type="checkbox" name="enabled" defaultChecked={current?.enabled ?? false} /> Activa
                          </label>
                          <Field label="Vence en (días)" name="days" type="number" min="0" max="90" defaultValue={current?.days ?? 1} className="w-32" />
                        </ActionForm>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Automatizaciones por producto y etapa" hint="Cuando una oportunidad entra a la etapa elegida (al crearse o al moverla), se programa una tarea para su dueño con el asunto y el nombre de la oportunidad. No se duplica mientras siga pendiente.">
            <Reveal label="Nueva automatización">
              <ActionForm action={saveStageAutomation} submitLabel="Crear automatización" className="space-y-4">
                <FormBlock title="Nueva automatización" cols={3}>{stageRuleFields()}</FormBlock>
              </ActionForm>
            </Reveal>
            {(stageRules.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no hay automatizaciones por etapa. Crea la primera con “Nueva automatización”: por ejemplo, un seguimiento a 3 días cuando un TOEFL pasa a Propuesta.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                {(stageRules.data ?? []).map((r) => (
                  <li key={r.id} className="border-t border-border first:border-t-0">
                    <details>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-[#f8fafc] [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{stageLabel.get(r.stage_id) ?? "Etapa eliminada"}</span>{" "}
                          <span className="text-muted-foreground">· {activityTypes[r.activity_type as keyof typeof activityTypes] ?? r.activity_type}: {r.subject}</span>
                        </span>
                        {r.enabled ? <Pill tone="teal">Activa · vence en {r.days} {r.days === 1 ? "día" : "días"}</Pill> : <Pill>Apagada</Pill>}
                      </summary>
                      <div className="space-y-3 border-t border-dashed border-border bg-[#f8fafc] px-4 py-3">
                          <ActionForm action={saveStageAutomation} submitLabel="Guardar" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
                            {stageRuleFields(r)}
                          </ActionForm>
                          <form action={deleteStageAutomation}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-sm text-red-700 underline">Eliminar automatización</button>
                          </form>
                        </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === "cambio" && (
        <Section title="Tipos de cambio" hint="Se usa la tasa vigente a la fecha de cierre de cada venta. Si falta una tasa, el dashboard lo avisa en vez de inventar la conversión.">
          {canStructure.data && (
            <Reveal label="Agregar tasa">
              <ActionForm action={addExchangeRate} submitLabel="Agregar tasa" className="space-y-4">
                <FormBlock title="Nueva tasa" cols={4}>
                  <SelectField label="1 unidad de" name="base_currency" defaultValue="USD" options={currencyOptions} />
                  <SelectField label="equivale en" name="quote_currency" defaultValue="MXN" options={currencyOptions} />
                  <Field label="Tasa" name="rate" type="number" step="0.00000001" min="0" required />
                  <Field label="Vigente desde" name="effective_at" type="date" required />
                </FormBlock>
              </ActionForm>
            </Reveal>
          )}
          <Table
            headers={["Vigente desde", "Tasa"]}
            rows={(rates.data ?? []).map((r) => [formatDay(r.effective_at), `1 ${r.base_currency} = ${Number(r.rate)} ${r.quote_currency}`])}
            empty="Todavía no hay tipos de cambio. Sin ellos, las ventas en otra moneda no se suman en el dashboard ni en las metas."
          />
        </Section>
      )}

      {tab === "estructura" && (
        <div className="space-y-8">
          <Section title="Empresas">
            {canStructure.data && (
              <Reveal label="Agregar empresa">
                <ActionForm action={createCompany} submitLabel="Agregar empresa" className="space-y-4">
                  <FormBlock title="Nueva empresa">
                    <Field label="Razón social" name="legal_name" required />
                    <Field label="Id. fiscal (opcional)" name="tax_id" />
                    <Field label="País" name="country_code" placeholder="MX" maxLength={2} required />
                  </FormBlock>
                </ActionForm>
              </Reveal>
            )}
            <Table
              headers={["Razón social", "Id. fiscal", "País", "Estado"]}
              rows={(companies.data ?? []).map((c) => [c.legal_name, c.tax_id ?? "—", c.country_code, c.status === "active" ? <Pill key="s" tone="teal">Activa</Pill> : <Pill key="s">Inactiva</Pill>])}
              empty="Todavía no hay empresas. Agrega la primera: unidades, oficinas y metas dependen de ella."
            />
          </Section>

          <Section title="Unidades de negocio">
            {canStructure.data && (
              <Reveal label="Agregar unidad" variant="outline">
                <ActionForm action={createBusinessUnit} submitLabel="Agregar unidad" className="space-y-4">
                  <FormBlock title="Nueva unidad de negocio" cols={2}>
                    <Field label="Nombre" name="name" required />
                    <SelectField label="Empresa" name="company_id" options={companyOptions} required />
                  </FormBlock>
                </ActionForm>
              </Reveal>
            )}
            <Table
              headers={["Unidad", "Empresa"]}
              rows={(units.data ?? []).map((u) => [u.name, companyName.get(u.company_id) ?? "—"])}
              empty="Todavía no hay unidades de negocio."
            />
          </Section>

          <Section title="Oficinas">
            {canStructure.data && (
              <Reveal label="Agregar oficina" variant="outline">
                <ActionForm action={createOffice} submitLabel="Agregar oficina" className="space-y-4">
                  <FormBlock title="Nueva oficina">
                    <Field label="Nombre" name="name" required />
                    <SelectField label="Empresa" name="company_id" options={companyOptions} required />
                    <SelectField
                      label="Unidad (opcional)"
                      name="business_unit_id"
                      options={[{ value: "", label: "Sin unidad" }, ...(units.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
                    />
                    <Field label="País" name="country_code" placeholder="MX" maxLength={2} required />
                    <Field label="Zona horaria" name="timezone" defaultValue="America/Mexico_City" required />
                  </FormBlock>
                </ActionForm>
              </Reveal>
            )}
            <Table
              headers={["Oficina", "Empresa", "Unidad", "País", "Zona horaria"]}
              rows={(offices.data ?? []).map((o) => [
                o.name,
                companyName.get(o.company_id) ?? "—",
                o.business_unit_id ? unitName.get(o.business_unit_id) ?? "—" : "—",
                o.country_code,
                o.timezone,
              ])}
              empty="Todavía no hay oficinas."
            />
          </Section>
        </div>
      )}

      {tab === "equipos" && (
        <Section title="Equipos" hint="Cada persona está en un solo equipo: asignarla a otro la cambia de equipo. Las metas de equipo suman lo de sus miembros.">
          {canStructure.data && (
            <div className="flex flex-wrap gap-3">
              <Reveal label="Crear equipo">
                <ActionForm action={createTeam} submitLabel="Crear equipo" className="space-y-4">
                  <FormBlock title="Nuevo equipo" cols={2}>
                    <Field label="Nombre del equipo" name="name" required />
                    <ComboField label="Líder (opcional)" name="leader_id" options={personOptions} placeholder="Sin líder · escribe un nombre" />
                  </FormBlock>
                </ActionForm>
              </Reveal>
              {(teams.data ?? []).length > 0 && (
                <Reveal label="Asignar persona a un equipo" variant="outline">
                  <ActionForm action={setTeamMember} submitLabel="Asignar al equipo" className="space-y-4">
                    <FormBlock title="Asignación" cols={2}>
                      <SelectField label="Equipo" name="team_id" options={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
                      <ComboField label="Persona" name="profile_id" options={personOptions} required placeholder="Escribe un nombre" />
                    </FormBlock>
                  </ActionForm>
                </Reveal>
              )}
            </div>
          )}
          <Table
            headers={["Equipo", "Líder", "Miembros"]}
            rows={(teams.data ?? []).map((t) => [
              <span key="n" className="font-medium">{t.name}</span>,
              t.leader_id ? personName.get(t.leader_id) ?? "—" : "—",
              <span key={t.id} className="flex flex-wrap gap-1.5">
                {(teamMembers.data ?? []).filter((m) => m.team_id === t.id).map((m) => (
                  <span key={m.profile_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {personName.get(m.profile_id) ?? "—"}
                    {canStructure.data && (
                      <form action={removeTeamMember.bind(null, m.profile_id)} className="inline">
                        <button type="submit" className="text-red-700" aria-label={`Quitar a ${personName.get(m.profile_id)} del equipo`}>×</button>
                      </form>
                    )}
                  </span>
                ))}
              </span>,
            ])}
            empty="Todavía no hay equipos. Crea uno para repartir metas por equipo y ver su avance."
          />
        </Section>
      )}

      {tab === "usuarios" && (
        <Section title="Usuarios" hint="Toca un nombre para cambiar su rol, qué cartera ve o desactivarlo.">
          {canUsers.data && (
            <Reveal label="Invitar usuario">
              <ActionForm action={createInvitation} submitLabel="Invitar" className="space-y-4">
                <FormBlock title="Nueva invitación" cols={2}>
                  <Field label="Correo" name="email" type="email" required />
                  <SelectField label="Rol" name="role_id" options={roleOptions} required />
                </FormBlock>
              </ActionForm>
            </Reveal>
          )}
          <Table
            headers={["Nombre", "Correo", "Roles", "Estado"]}
            rows={(profiles.data ?? []).map((p) => [
              <Link key={p.id} href={`/administracion/usuarios/${p.id}`} className="font-medium hover:underline">{p.full_name || "—"}</Link>,
              p.email,
              (profileRoles.data ?? []).filter((pr) => pr.profile_id === p.id).map((pr) => roleName.get(pr.role_id)).join(", ") || "—",
              p.status === "active" ? <Pill key="s" tone="teal">Activo</Pill> : <Pill key="s">Inactivo</Pill>,
            ])}
            empty="Todavía no hay usuarios."
          />
          {canUsers.data && (invitations.data ?? []).length > 0 && (
            <>
              <h3 className="text-sm font-semibold">Invitaciones</h3>
              <Table
                headers={["Correo", "Rol", "Estado"]}
                rows={(invitations.data ?? []).map((i) => [i.email, roleName.get(i.role_id) ?? "—", i.accepted_at ? <Pill key="s" tone="teal">Aceptada</Pill> : <Pill key="s" tone="amber">Pendiente</Pill>])}
                empty=""
              />
            </>
          )}
        </Section>
      )}
    </div>
  );
}
