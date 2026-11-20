import { Globe, Mail, MapPin, MessageCircle, Pencil, Phone, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, ActivityItem, NewActivityForm, type ActivityRow } from "@/modules/activities/activity-panel";
import { daysAgo } from "@/modules/activities/time";
import { addBranch, addContact, updateInstitution } from "@/modules/institutions/actions";
import { InstitutionFields, loadInstitutionOptions } from "@/modules/institutions/institution-fields";
import { formatMoney, opportunityStatuses, totalsByCurrency } from "@/modules/opportunities/labels";
import { decisionRoles, institutionStatuses, institutionTypes, potentials, toOptions } from "@/modules/institutions/labels";

const chip = "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted";
const date = (d: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date(d));
const digits = (p: string) => p.replace(/\D/g, "");
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

function Card({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 rounded-xl border border-border p-5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
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
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle();
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
  const oppProduct = new Map((oppProducts ?? []).map((p) => [p.default_pipeline_id, p.name]));
  const contactIds = (links.data ?? []).map((l) => l.contact_id);
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
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

  return (
    <div className="max-w-6xl space-y-6">
      <Link href="/instituciones" className="text-sm text-muted-foreground underline">Instituciones</Link>

      {aviso === "contacto" && (
        <p role="alert" className="rounded-md border border-border p-3 text-sm text-red-700">
          La institución se creó, pero el contacto principal no se pudo guardar (su correo puede pertenecer a otra cartera). Agrégalo abajo.
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-primary p-6 text-primary-foreground">
        <div>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{institutionTypes[inst.institution_type as keyof typeof institutionTypes]}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{institutionStatuses[inst.status as keyof typeof institutionStatuses]}</span>
          {inst.potential && (
            <span className="rounded-full bg-white/15 px-2.5 py-1">Potencial {potentials[inst.potential as keyof typeof potentials].toLowerCase()}</span>
          )}
          {inst.tags?.map((t: string) => <span key={t} className="rounded-full border border-white/25 px-2.5 py-1">{t}</span>)}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{inst.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-80">
          {place && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{place}</span>}
          {inst.source && <span>Origen: {inst.source}</span>}
          <span>
            {inst.last_activity_at ? `Última interacción hace ${daysAgo(inst.last_activity_at)} días` : "Sin interacciones registradas"}
          </span>
          {!inst.next_activity_at && <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-xs font-medium text-black">Sin próxima actividad</span>}
          {parent.data && (
            <span>Grupo: <Link href={`/instituciones/${parent.data.id}`} className="underline">{parent.data.name}</Link></span>
          )}
        </p>
        </div>
        {openOpps.length > 0 && (
          <div className="rounded-lg bg-white/10 p-4 text-right">
            <p className="text-xs uppercase tracking-wide opacity-70">Pipeline abierto ({openOpps.length})</p>
            <p className="text-2xl font-semibold">{totalsByCurrency(openOpps, (o) => o.currency_code, (o) => Number(o.amount))}</p>
            <p className="text-xs opacity-70">Ponderado {totalsByCurrency(openOpps, (o) => o.currency_code, (o) => (Number(o.amount) * o.probability) / 100)}</p>
          </div>
        )}
      </header>

      <nav aria-label="Acciones" className="flex flex-wrap items-center gap-2">
        <span className={chip}><User className="size-4" aria-hidden />{owner ?? "Sin responsable"}</span>
        {mail && <a href={`mailto:${mail}`} className={chip}><Mail className="size-4" aria-hidden />Enviar correo</a>}
        {phone && <a href={`tel:${digits(phone)}`} className={chip}><Phone className="size-4" aria-hidden />Llamar</a>}
        {phone && (
          <a href={`https://wa.me/${digits(phone)}`} target="_blank" rel="noopener noreferrer" className={chip}>
            <MessageCircle className="size-4" aria-hidden />WhatsApp
          </a>
        )}
        {inst.website && (
          <a href={href(inst.website)} target="_blank" rel="noopener noreferrer" className={chip}><Globe className="size-4" aria-hidden />Sitio web</a>
        )}
        {canWrite && (
          <a href="#editar" className={`${chip} ml-auto border-primary bg-primary text-primary-foreground hover:bg-primary/90`}>
            <Pencil className="size-4" aria-hidden />Editar
          </a>
        )}
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Contactos (${people.length})`}>
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
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Agregar contacto</summary>
              <ActionForm action={addContact.bind(null, id)} submitLabel="Agregar contacto" className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
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

        <Card title="Datos y ubicación">
          <Facts
            items={[
              ["Razón social", inst.legal_name],
              ["Dirección", inst.address],
              ["Ciudad", inst.city],
              ["Estado / región", inst.region],
              ["País", inst.country_code],
              ["Teléfono", inst.phone],
              ["Correo general", inst.email],
              ["Id. fiscal", inst.tax_id],
              ["Alumnos / empleados", inst.estimated_size?.toLocaleString("es-MX")],
              ["Oficina", office],
              ["Alta", date(inst.created_at)],
              ["Última actualización", inst.updated_at !== inst.created_at ? date(inst.updated_at) : null],
            ]}
          />
        </Card>
      </div>

      <Card
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
                <span>{formatMoney(o.amount, o.currency_code)} · {o.probability}%{o.expected_close_date ? ` · ${o.expected_close_date}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Actividades (${pendingActs.length} pendientes)`}>
        {pendingActs.length > 0 && (
          <ul className="divide-y divide-border">
            {pendingActs.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={personName} canAct={Boolean(canWrite)} />)}
          </ul>
        )}
        {canWrite && (
          <details className="rounded-md border border-border p-3" open={activities.length === 0}>
            <summary className="cursor-pointer text-sm font-medium">Registrar o programar actividad</summary>
            <div className="mt-3">
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

      {inst.notes && (
        <Card title="Notas">
          <p className="whitespace-pre-line text-sm">{inst.notes}</p>
        </Card>
      )}

      <Card title="Sucursales y grupo">
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
          <ActionForm action={addBranch.bind(null, id)} submitLabel="Agregar sucursal" className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Nombre" name="name" required />
            <Field label="Ciudad" name="city" />
            <Field label="Dirección" name="address" />
          </ActionForm>
        )}
      </Card>

      {canWrite && (
        <section id="editar" className="scroll-mt-6">
          <Card title="Editar información">
            <ActionForm action={updateInstitution.bind(null, id)} submitLabel="Guardar cambios">
              <InstitutionFields values={inst} {...options} parents={options.parents.filter((o) => o.value !== id)} />
            </ActionForm>
          </Card>
        </section>
      )}
    </div>
  );
}
