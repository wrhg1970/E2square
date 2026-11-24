import { Building2, CalendarPlus, FileText, Network, ChevronDown, Clock, Gauge, History, Mail, MapPin, MessageCircle, NotebookText, Pencil, Plus, Target, User, UserRound, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, ActivityItem, NewActivityForm, type ActivityRow } from "@/modules/activities/activity-panel";
import { daysAgo, formatDateTime } from "@/modules/activities/time";
import { addBranch, addContact, updateInstitution } from "@/modules/institutions/actions";
import { InstitutionFields, loadInstitutionOptions } from "@/modules/institutions/institution-fields";
import { formatMoney, opportunityStatuses, totalsByCurrency } from "@/modules/opportunities/labels";
import { loadScores, scoreTone } from "@/modules/institutions/scoring";
import { decisionRoles, institutionStatuses, institutionTypes, potentials, toOptions } from "@/modules/institutions/labels";
import { formatDay } from "@/modules/activities/time";
import { sendWhatsapp, setConsent } from "@/modules/whatsapp/actions";
import { whatsappEnv } from "@/modules/whatsapp/config";

const consentLabel: Record<string, string> = { granted: "Aceptó WhatsApp", revoked: "No contactar" };
const waStatus: Record<string, string> = { pending: "Enviando", sent: "Enviado", delivered: "Entregado", read: "Leído", failed: "Falló" };

const card = "rounded-xl border border-border bg-background p-5 shadow-sm";
// Formularios plegados detrás de un botón: la ficha se lee primero, se captura después.
const addSummary = `${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer list-none group-open:bg-muted [&::-webkit-details-marker]:hidden`;
const chip = "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted";
const date = (d: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(d));
const digits = (p: string) => p.replace(/\D/g, "");
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

function Card({ title, icon: Icon, aside, children, className, id }: { title: string; icon?: LucideIcon; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`scroll-mt-6 space-y-3 ${card} ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <h2 className="flex items-center gap-2 font-semibold">{Icon && <Icon className="size-4 text-primary" aria-hidden />}{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// Un dato de tarjeta; si falta lo dice, para que se vea qué capturar.
function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words ${empty ? "text-muted-foreground/70" : ""}`}>{empty ? "Sin registrar" : children}</dd>
    </div>
  );
}

// Solo muestra los datos que existen: nada de "N/D".
function Facts({ items }: { items: [string, ReactNode][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!shown.length) return <p className="text-sm text-muted-foreground">Sin datos registrados.</p>;
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function InstitutionPage({ params, searchParams }: PageProps<"/instituciones/[id]">) {
  const { id } = await params;
  const { aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: inst } = await supabase.from("institutions").select("*").eq("id", id).maybeSingle();
  if (!inst) notFound();

  const [links, branches, members, parent, options, { data: canWrite }, opps, acts, { data: meId }] = await Promise.all([
    supabase.from("institution_contacts").select("id, contact_id, job_title, department, decision_role, is_primary").eq("institution_id", id),
    supabase.from("institution_branches").select("id, name, city, address").eq("institution_id", id).order("name"),
    supabase.from("institutions").select("id, name, city").eq("parent_institution_id", id).order("name"),
    inst.parent_institution_id
      ? supabase.from("institutions").select("id, name").eq("id", inst.parent_institution_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadInstitutionOptions(supabase),
    supabase.rpc("has_permission", { permission: "institutions.write" }),
    supabase.from("opportunities").select("id, name, pipeline_id, stage_id, status, amount, probability, currency_code, expected_close_date").eq("institution_id", id).order("created_at", { ascending: false }),
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("institution_id", id).order("due_at", { ascending: false }).limit(100),
    supabase.rpc("current_profile_id"),
  ]);
  const [{ data: me }, { data: canAudit }, { data: mails }, scores, { data: catalog }, { data: waTemplates }, { count: waNumbers }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle(),
    supabase.rpc("has_permission", { permission: "audit.read" }),
    supabase.from("communications").select("id, channel, direction, subject, snippet, from_email, from_phone, to_phone, status, error, sent_at").eq("institution_id", id)
      .order("sent_at", { ascending: false }).limit(20),
    loadScores(supabase, [id]),
    supabase.from("products").select("name, default_pipeline_id").eq("active", true).not("default_pipeline_id", "is", null).order("name"),
    supabase.from("whatsapp_templates").select("id, name, body_preview").eq("active", true).order("name"),
    supabase.from("whatsapp_accounts").select("id", { count: "exact", head: true }),
  ]);
  const canSendWa = (waNumbers ?? 0) > 0 && whatsappEnv() !== null;
  const score = scores.get(id);
  const tz = me?.timezone ?? "America/Mexico_City";
  const activities = (acts.data ?? []) as ActivityRow[];
  const pendingActs = activities.filter((a) => a.status === "pending").sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
  const pastActs = activities.filter((a) => a.status !== "pending");
  const oppRows = opps.data ?? [];
  const openOpps = oppRows.filter((o) => o.status === "open");
  const [{ data: oppStages }, { data: oppProducts }] = oppRows.length
    ? await Promise.all([
        supabase.from("pipeline_stages").select("id, name").in("id", [...new Set(oppRows.map((o) => o.stage_id))]),
        supabase.from("products").select("default_pipeline_id, name").in("default_pipeline_id", [...new Set(oppRows.map((o) => o.pipeline_id))]),
      ])
    : [{ data: [] }, { data: [] }];
  const oppStage = new Map((oppStages ?? []).map((st) => [st.id, st.name]));
  // Cross-sell por reglas: productos activos que nunca se le han ofrecido a esta institución.
  const notOffered = (catalog ?? []).filter((p) => !oppRows.some((o) => o.pipeline_id === p.default_pipeline_id));
  const oppProduct = new Map((oppProducts ?? []).map((p) => [p.default_pipeline_id, p.name]));
  const contactIds = (links.data ?? []).map((l) => l.contact_id);
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, first_name, last_name, email, phone, consent_status, consent_source").in("id", contactIds)
    : { data: [] };
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
  const people = (links.data ?? [])
    .map((l) => ({ ...l, contact: contactById.get(l.contact_id) }))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const primary = people[0]?.contact;

  const owner = options.owners.find((o) => o.value === inst.owner_id)?.label;
  const personName = new Map(options.owners.map((o) => [o.value, o.label]));
  const office = options.offices.find((o) => o.value === inst.office_id)?.label;
  const mail = primary?.email ?? inst.email;
  const phone = primary?.phone ?? inst.phone;
  const place = [inst.city, inst.region, inst.country_code].filter(Boolean).join(", ");
  const address = [inst.address, place].filter(Boolean).join(", ");
  // Alerta visual simple, no una regla de SLA: sin próxima actividad o más de 30 días sin interacción.
  const stale = !inst.next_activity_at || !inst.last_activity_at || daysAgo(inst.last_activity_at) > 30;

  return (
    <div className="max-w-6xl space-y-6">
      <Link href="/instituciones" className="text-sm text-muted-foreground underline">Instituciones</Link>

      {aviso === "contacto" && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm text-red-700">
          La institución se creó, pero el contacto principal no se pudo guardar (su correo puede pertenecer a otra cartera). Agrégalo abajo.
        </p>
      )}

      <header className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-band p-6 text-white shadow-lg shadow-band/20">
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 sm:flex">
            <Building2 className="size-7 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-white/15 px-2.5 py-1">{institutionTypes[inst.institution_type as keyof typeof institutionTypes]}</span>
              <span className="rounded-full bg-primary/20 px-2.5 py-1 text-primary">{institutionStatuses[inst.status as keyof typeof institutionStatuses]}</span>
              {inst.potential && (
                <span className="rounded-full bg-white/15 px-2.5 py-1">Potencial {potentials[inst.potential as keyof typeof potentials].toLowerCase()}</span>
              )}
              {!inst.next_activity_at && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-black"><Clock className="size-3.5" aria-hidden />Sin próxima actividad</span>
              )}
              {inst.tags?.map((t: string) => <span key={t} className="rounded-full border border-white/25 px-2.5 py-1 normal-case">{t}</span>)}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{inst.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-80">
              {place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{place}</span>}
              {inst.source && <span>Origen: <span className="font-medium">{inst.source}</span></span>}
              {parent.data && (
                <span>Grupo: <Link href={`/instituciones/${parent.data.id}`} className="underline">{parent.data.name}</Link></span>
              )}
              {canAudit && <Link href={`/administracion/bitacora?registro=${id}&desde=2000-01-01`} className="underline">Bitácora de cambios</Link>}
            </p>
          </div>
        </div>
        {openOpps.length > 0 && (
          <div className="rounded-xl border border-white/15 bg-white/10 px-5 py-4 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Pipeline abierto ({openOpps.length})</p>
            <p className="text-2xl font-semibold text-primary tabular-nums">{totalsByCurrency(openOpps, (o) => o.currency_code, (o) => Number(o.amount))}</p>
            <p className="text-xs opacity-70">Ponderado {totalsByCurrency(openOpps, (o) => o.currency_code, (o) => (Number(o.amount) * o.probability) / 100)}</p>
          </div>
        )}
      </header>

      <nav aria-label="Acciones" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/50 p-3">
        <span className="text-sm text-muted-foreground">Responsable:</span>
        <span className={chip}><User className="size-4" aria-hidden />{owner ?? "Sin responsable"}</span>
        <span className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          {canWrite && <a href="#actividades" className={chip}><CalendarPlus className="size-4" aria-hidden />Agendar actividad</a>}
          {mail && <a href={`mailto:${mail}`} className={chip}><Mail className="size-4" aria-hidden />Enviar correo</a>}
          {phone && (
            <a href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener noreferrer" className={chip}>
              <MessageCircle className="size-4" aria-hidden />WhatsApp
            </a>
          )}
          {canWrite && (
            <a href="#editar" className={`${chip} border-primary bg-primary font-medium text-primary-foreground hover:bg-primary/90`}>
              <Pencil className="size-4" aria-hidden />Editar información
            </a>
          )}
        </span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Contacto principal" icon={UserRound}
          aside={people[0]?.decision_role && <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{decisionRoles[people[0].decision_role as keyof typeof decisionRoles]}</span>}>
          {primary ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Fact label="Nombre completo" wide>
                <span className="text-base font-semibold">{`${primary.first_name} ${primary.last_name}`.trim()}</span>
                {people[0].job_title && <span className="block text-muted-foreground">{people[0].job_title}</span>}
              </Fact>
              <Fact label="Correo electrónico">{primary.email && <a href={`mailto:${primary.email}`} className="break-all text-primary hover:underline">{primary.email}</a>}</Fact>
              <Fact label="Teléfono / WhatsApp">{primary.phone && <a href={`tel:${digits(primary.phone)}`} className="tabular-nums hover:underline">{primary.phone}</a>}</Fact>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Sin contacto principal. {canWrite && <a href="#contactos" className="text-primary underline">Agregar contacto</a>}</p>
          )}
          {(inst.phone || inst.email || inst.website) && (
            <dl className="grid gap-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
              {inst.phone && <Fact label="Teléfono de la institución"><a href={`tel:${digits(inst.phone)}`} className="tabular-nums hover:underline">{inst.phone}</a></Fact>}
              {inst.email && <Fact label="Correo general"><a href={`mailto:${inst.email}`} className="break-all hover:underline">{inst.email}</a></Fact>}
              {inst.website && (
                <Fact label="Sitio web">
                  <a href={href(inst.website)} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">{inst.website.replace(/^https?:\/\//i, "")}</a>
                </Fact>
              )}
            </dl>
          )}
        </Card>

        <Card title="Ubicación y sede" icon={Building2}
          aside={inst.country_code && <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium">{inst.country_code}</span>}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact label="Dirección" wide>
              {inst.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {inst.address} <MapPin className="inline size-3.5 text-primary" aria-label="Ver en el mapa" />
                </a>
              )}
            </Fact>
            <Fact label="Ciudad">{inst.city}</Fact>
            <Fact label="Estado / región">{inst.region}</Fact>
            <Fact label="Fecha de registro">{date(inst.created_at)}</Fact>
            <Fact label="Oficina">{office}</Fact>
            <Fact label="Seguimiento" wide>
              <span className={`inline-flex items-center gap-1.5 font-medium ${stale ? "text-amber-700" : ""}`}>
                <Clock className="size-4" aria-hidden />
                {inst.last_activity_at ? `Última interacción hace ${daysAgo(inst.last_activity_at)} días` : "Sin interacciones registradas"}
              </span>
            </Fact>
          </dl>
          <details className="group border-t border-border pt-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Ver datos fiscales y tamaño</span><span className="hidden group-open:inline">Ocultar datos</span>
            </summary>
            <div className="mt-3">
              <Facts
                items={[
                  ["Razón social", inst.legal_name],
                  ["Id. fiscal", inst.tax_id],
                  ["Alumnos / empleados", inst.estimated_size?.toLocaleString("es-MX")],
                  ["Última actualización", inst.updated_at !== inst.created_at ? date(inst.updated_at) : null],
                ]}
              />
            </div>
          </details>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card title="Notas y observaciones" icon={NotebookText} className="lg:col-span-2"
          aside={canWrite && <a href="#editar" className="text-sm text-primary underline">{inst.notes ? "Editar" : "Agregar"}</a>}>
          {inst.notes ? <p className="whitespace-pre-line text-sm">{inst.notes}</p> : <p className="text-sm text-muted-foreground">Sin notas todavía.</p>}
        </Card>
        {score && (
          <section aria-labelledby="puntaje" className={card}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <h2 id="puntaje" className="flex items-center gap-2 font-semibold"><Gauge className="size-4 text-primary" aria-hidden />Puntaje</h2>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums ${scoreTone(score.score)}`}>{score.score ?? "—"} / 100</span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <ul className="mt-3 space-y-2 text-sm">
                {score.factors.map((f) => (
                  <li key={f.key} className="border-b border-border/60 pb-1.5">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{f.label}</span>
                      <span className="shrink-0 tabular-nums">{Math.round(f.value * f.weight * 10) / 10} / {f.weight}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{f.detail}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Calculado: {formatDateTime(score.computed_at, tz)}</p>
            </details>
            <p className="mt-2 text-xs text-muted-foreground group-open:hidden">Toca para ver cómo se calcula.</p>
          </section>
        )}
      </div>

      <Card id="actividades" icon={History} title={`Actividades y tareas (${pendingActs.length} ${pendingActs.length === 1 ? "pendiente" : "pendientes"})`}>
        {pendingActs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin actividades pendientes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pendingActs.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={Boolean(canWrite)} />)}
          </ul>
        )}
        {canWrite && (
          <details className="group">
            <summary className={addSummary}><Plus className="size-4" aria-hidden />Registrar o programar actividad</summary>
            <div className="mt-3 rounded-md border border-border p-3">
              <NewActivityForm institutionId={id} contacts={people.filter((p) => p.contact).map((p) => ({ value: p.contact_id, label: `${p.contact!.first_name} ${p.contact!.last_name}`.trim() }))} />
            </div>
          </details>
        )}
        {pastActs.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Historial ({pastActs.length})</summary>
            <ul className="mt-2 divide-y divide-border">
              {pastActs.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={false} />)}
            </ul>
          </details>
        )}
      </Card>

      <Card
        icon={Target}
        title={`Oportunidades (${oppRows.length})`}
        aside={canWrite && <Link href={`/oportunidades/nueva?institucion=${id}`} className="text-sm underline">Nueva oportunidad</Link>}
      >
        {oppRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin oportunidades todavía.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {oppRows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/oportunidades/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                  <span className="text-muted-foreground"> · {oppProduct.get(o.pipeline_id)} · {oppStage.get(o.stage_id)}{o.status !== "open" ? ` (${opportunityStatuses[o.status as keyof typeof opportunityStatuses]})` : ""}</span>
                </span>
                <span>{formatMoney(o.amount, o.currency_code)} · {o.probability}%{o.expected_close_date ? ` · ${formatDay(o.expected_close_date)}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {oppRows.length > 0 && notOffered.length > 0 && (
          <div className="rounded-md bg-muted/60 p-3 text-sm">
            <p className="font-medium">Proveedores que aún no le has ofrecido</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {notOffered.map((p) => (
                <li key={p.default_pipeline_id}>
                  {canWrite ? (
                    <Link href={`/oportunidades/nueva?institucion=${id}&producto=${p.default_pipeline_id}`} className="rounded-full border border-border bg-background px-2.5 py-0.5 hover:bg-muted">{p.name}</Link>
                  ) : (
                    <span className="rounded-full border border-border px-2.5 py-0.5">{p.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card id="contactos" icon={Users} title={`Contactos (${people.length})`}>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin contactos todavía.</p>
        ) : (
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="space-y-0.5 py-3 text-sm first:pt-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {p.contact ? `${p.contact.first_name} ${p.contact.last_name}`.trim() : "Contacto de otra cartera"}
                  {p.is_primary && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">Principal</span>}
                  {p.decision_role && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs">{decisionRoles[p.decision_role as keyof typeof decisionRoles]}</span>
                  )}
                </p>
                {(p.job_title || p.department) && <p className="text-muted-foreground">{[p.job_title, p.department].filter(Boolean).join(" · ")}</p>}
                <p className="flex flex-wrap gap-x-3">
                  {p.contact?.email && <a href={`mailto:${p.contact.email}`} className="underline">{p.contact.email}</a>}
                  {p.contact?.phone && <a href={`tel:${digits(p.contact.phone)}`} className="underline">{p.contact.phone}</a>}
                  {p.contact && consentLabel[p.contact.consent_status] && (
                    <span title={p.contact.consent_source ?? undefined} className={`rounded px-1.5 py-0.5 text-xs ${p.contact.consent_status === "revoked" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                      {consentLabel[p.contact.consent_status]}
                    </span>
                  )}
                </p>
                {canWrite && p.contact?.phone && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Consentimiento de WhatsApp</summary>
                    <ActionForm action={setConsent.bind(null, id, p.contact.id)} submitLabel="Guardar" className="mt-2 grid gap-2 sm:grid-cols-2 sm:items-end">
                      <SelectField label="Estado" name="consent_status" defaultValue={p.contact.consent_status === "revoked" ? "revoked" : "granted"}
                        options={[{ value: "granted", label: "Aceptó recibir WhatsApp" }, { value: "revoked", label: "No contactar" }]} />
                      <Field label="Cómo lo autorizó" name="consent_source" placeholder="Formulario de feria, llamada…" required />
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <details className="group">
            <summary className={addSummary}><Plus className="size-4" aria-hidden />Agregar contacto</summary>
            <ActionForm action={addContact.bind(null, id)} submitLabel="Agregar contacto" className="mt-3 grid rounded-md border border-border p-3 gap-3 sm:grid-cols-2 sm:items-end">
              <Field label="Nombre" name="first_name" required />
              <Field label="Apellidos" name="last_name" />
              <Field label="Correo" name="email" type="email" />
              <Field label="Teléfono / WhatsApp" name="phone" type="tel" />
              <Field label="Cargo" name="job_title" />
              <Field label="Área" name="department" />
              <SelectField label="Rol en la decisión" name="decision_role" options={toOptions(decisionRoles, "Sin definir")} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_primary" /> Contacto principal
              </label>
            </ActionForm>
          </details>
        )}
      </Card>
      <Card title="Correos y WhatsApp" icon={Mail}>
        {(mails ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin correos ni mensajes registrados. Los correos llegan al conectar Gmail en Integraciones; los WhatsApp, al conectar el número de la empresa.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(mails ?? []).map((m) => (
              <li key={m.id} className="space-y-0.5 py-2 first:pt-0">
                <p className="font-medium">
                  {m.channel === "whatsapp"
                    ? m.direction === "outbound" ? `WhatsApp enviado a ${m.to_phone} · ${waStatus[m.status ?? ""] ?? ""}` : "WhatsApp recibido"
                    : `${m.direction === "outbound" ? "Enviado" : "Recibido"}: ${m.subject || "(sin asunto)"}`}
                </p>
                <p className="text-muted-foreground">{formatDateTime(m.sent_at, tz)} · {m.direction === "outbound" && m.channel === "whatsapp" ? "Desde el CRM" : m.from_email ?? m.from_phone}</p>
                {m.error && <p className="text-red-700">{m.error}</p>}
                {m.snippet && <p className="line-clamp-2 text-muted-foreground">{m.snippet}</p>}
              </li>
            ))}
          </ul>
        )}
        {canSendWa && people.some((p) => p.contact?.phone) && (
          <details className="group">
            <summary className={addSummary}><MessageCircle className="size-4" aria-hidden />Enviar WhatsApp</summary>
            <p className="mt-3 text-xs text-muted-foreground">
              Mensaje libre solo si el contacto te escribió en las últimas 24 h. Fuera de esa ventana usa una plantilla aprobada, y solo si el contacto aceptó recibir WhatsApp.
            </p>
            <ActionForm action={sendWhatsapp.bind(null, id)} submitLabel="Enviar" className="mt-3 grid gap-3">
              <SelectField label="Contacto" name="contact_id" required
                options={people.filter((p) => p.contact?.phone && p.contact.consent_status !== "revoked")
                  .map((p) => ({ value: p.contact!.id, label: `${p.contact!.first_name} ${p.contact!.last_name} · ${p.contact!.phone}`.trim() }))} />
              <SelectField label="Plantilla" name="template_id"
                options={[{ value: "", label: "Mensaje libre (ventana de 24 h)" }, ...(waTemplates ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.body_preview.slice(0, 60)}` }))]} />
              <TextareaField label="Mensaje libre" name="text" maxLength={4096} placeholder="Solo si no elegiste plantilla" />
            </ActionForm>
          </details>
        )}
      </Card>

      <Card title="Documentos" icon={FileText}>
        <DocumentsPanel institutionId={id} canWrite={Boolean(canWrite)} />
      </Card>

      <Card title="Sucursales y grupo" icon={Network}>
        {(branches.data ?? []).length === 0 && (members.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin sucursales ni instituciones del grupo.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(branches.data ?? []).map((b) => (
              <li key={b.id}>{b.name}{b.city ? `, ${b.city}` : ""}{b.address ? ` · ${b.address}` : ""}</li>
            ))}
            {(members.data ?? []).map((m) => (
              <li key={m.id}>
                <Link href={`/instituciones/${m.id}`} className="underline">{m.name}</Link>{m.city ? `, ${m.city}` : ""} (miembro del grupo)
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <details className="group">
            <summary className={addSummary}><Plus className="size-4" aria-hidden />Agregar sucursal</summary>
            <ActionForm action={addBranch.bind(null, id)} submitLabel="Agregar sucursal" className="mt-3 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-4 sm:items-end">
              <Field label="Nombre" name="name" required />
              <Field label="Ciudad" name="city" />
              <Field label="Dirección" name="address" />
            </ActionForm>
          </details>
        )}
      </Card>

      {canWrite && (
        <section id="editar" className="scroll-mt-6">
          <Card title="Editar información" icon={Pencil}>
            <ActionForm action={updateInstitution.bind(null, id)} submitLabel="Guardar cambios">
              <InstitutionFields values={inst} {...options} parents={options.parents.filter((o) => o.value !== id)} />
            </ActionForm>
          </Card>
        </section>
      )}
    </div>
  );
}
