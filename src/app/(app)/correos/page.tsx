import type { ReactNode } from "react";
import Link from "next/link";
import { Copy, Mail, Pencil, Search, Send, Trash2 } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { AutoForm } from "@/components/ui/auto-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { ComboField } from "@/components/ui/combo-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import { createClient } from "@/lib/supabase/server";
import { googleEnv } from "@/modules/google/config";
import { createTemplate, deleteTemplate, duplicateTemplate, updateTemplate } from "@/modules/email/actions";
import { ComposeForm } from "@/modules/email/compose-form";
import { categoryTone, fillTemplate, templateCategories, templateVariables, type TemplateCategory } from "@/modules/email/templates";

type Template = { id: string; category: TemplateCategory; title: string; subject: string; body: string; created_by: string | null };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const categoryOptions = Object.entries(templateCategories).map(([value, label]) => ({ value, label }));
const variableHint = `Variables: ${Object.keys(templateVariables).map((v) => `{{${v}}}`).join(" · ")}`;

function TemplateFields({ t }: { t?: Template }) {
  return (
    <>
      <FormBlock title="Plantilla" cols={2}>
        <Field label="Título" name="title" defaultValue={t?.title} placeholder="Presentación a colegios" required maxLength={200} />
        <SelectField label="Categoría" name="category" defaultValue={t?.category} options={categoryOptions} />
      </FormBlock>
      <Field label="Asunto" name="subject" defaultValue={t?.subject} placeholder="Programas educativos para {{nombre_institucion}}" required maxLength={300} />
      <TextareaField label="Mensaje" name="body" defaultValue={t?.body} rows={10} required maxLength={20000}
        placeholder={"Estimado/a {{contacto}}:\n\n…\n\nSaludos,\n{{mi_nombre}}"} />
      <p className="text-xs text-muted-foreground">{variableHint}. Se llenan solas con los datos de la institución y su contacto al usar la plantilla.</p>
    </>
  );
}

export default async function EmailPage({ searchParams }: PageProps<"/correos">) {
  const sp = await searchParams;
  const view = sp.ver === "redactar" ? "redactar" : "plantillas";
  const q = str(sp.q);
  const category = str(sp.categoria) in templateCategories ? str(sp.categoria) : "";
  const supabase = await createClient();
  const [{ data: all, error }, { data: me }, { data: canManage }] = await Promise.all([
    supabase.from("email_templates").select("id, category, title, subject, body, created_by").order("category").order("title"),
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "email_templates.manage" }),
  ]);
  const templates = (all ?? []) as Template[];
  const canEdit = (t: Template) => Boolean(canManage) || t.created_by === me;

  const tabs = (
    <Segmented label="Sección" items={[
      { href: "/correos", label: `Plantillas (${templates.length})`, current: view === "plantillas" },
      { href: "/correos?ver=redactar", label: "Redactar", current: view === "redactar" },
    ]} />
  );
  const newForm = (
    <ActionForm action={createTemplate} submitLabel="Guardar plantilla" className="space-y-4"><TemplateFields /></ActionForm>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Correos</h1>
          <p className="text-sm text-muted-foreground">Plantillas de correo para todo el equipo. Elige una, escoge la institución y el correo sale con sus datos ya puestos.</p>
        </div>
        <div className="on-light">{tabs}</div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar las plantillas. Recarga la página.</p>
      ) : view === "redactar" ? (
        <Compose sp={sp} templates={templates} />
      ) : !templates.length ? (
        <EmptyState icon={Mail} title="Todavía no hay plantillas"
          action={<div className="w-full max-w-3xl text-left"><Reveal label="Crear la primera plantilla" title="Nueva plantilla">{newForm}</Reveal></div>}>
          Guarda aquí los correos que mandas una y otra vez (presentación, propuesta, confirmación de reunión, seguimiento).
          Usa variables como {"{{nombre_institucion}}"} y {"{{contacto}}"} para que se llenen solas.
        </EmptyState>
      ) : (
        <TemplateList templates={templates} q={q} category={category} canEdit={canEdit} newForm={newForm} />
      )}
    </div>
  );
}

function TemplateList({ templates, q, category, canEdit, newForm }: {
  templates: Template[]; q: string; category: string; canEdit: (t: Template) => boolean; newForm: ReactNode;
}) {
  const needle = q.toLowerCase();
  const shown = templates.filter((t) => (!category || t.category === category)
    && (!needle || [t.title, t.subject, templateCategories[t.category]].some((s) => s.toLowerCase().includes(needle))));
  return (
    <>
      <AutoForm role="search" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Buscar</span>
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={q} placeholder="Título, asunto o categoría · Enter para buscar"
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
          </span>
        </label>
        <SelectField label="Categoría" name="categoria" defaultValue={category} className="w-48"
          options={[{ value: "", label: "Todas" }, ...categoryOptions]} />
      </AutoForm>
      <Reveal label="Crear nueva plantilla" title="Nueva plantilla">{newForm}</Reveal>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna plantilla coincide con la búsqueda. <Link href="/correos" className="underline">Ver todas</Link></p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((t) => (
            <article key={t.id} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1.5">
                  <Pill tone={categoryTone[t.category]}>{templateCategories[t.category]}</Pill>
                  <h2 className="font-semibold">{t.title}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <form action={duplicateTemplate.bind(null, t.id)}>
                    <Button type="submit" variant="ghost" size="icon" title="Duplicar" aria-label={`Duplicar ${t.title}`}><Copy className="size-4" aria-hidden /></Button>
                  </form>
                  {canEdit(t) && (
                    <details className="relative">
                      <summary title="Eliminar" aria-label={`Eliminar ${t.title}`}
                        className={`${buttonVariants({ variant: "ghost", size: "icon" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                        <Trash2 className="size-4" aria-hidden />
                      </summary>
                      <form action={deleteTemplate.bind(null, t.id)}
                        className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-background p-3 text-sm shadow-lg">
                        <p className="mb-2">¿Eliminar esta plantilla? No se puede deshacer.</p>
                        <Button type="submit" size="sm" className="bg-red-700 hover:bg-red-800">Sí, eliminar</Button>
                      </form>
                    </details>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p><span className="text-muted-foreground">Asunto: </span><span className="font-medium">{t.subject}</span></p>
                <p className="mt-2 line-clamp-3 whitespace-pre-line text-muted-foreground">{t.body}</p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/correos?ver=redactar&plantilla=${t.id}`} className={`${buttonVariants()} flex-1`}>
                  <Send className="size-4" aria-hidden />Usar esta plantilla
                </Link>
              </div>
              {canEdit(t) && (
                <details className="group">
                  <summary className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                    <Pencil className="size-4" aria-hidden /><span className="group-open:hidden">Editar</span><span className="hidden group-open:inline">Cerrar</span>
                  </summary>
                  <div className="mt-3 border-t border-border pt-3">
                    <ActionForm action={updateTemplate.bind(null, t.id)} submitLabel="Guardar cambios" className="space-y-4"><TemplateFields t={t} /></ActionForm>
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

async function Compose({ sp, templates }: { sp: Record<string, string | string[] | undefined>; templates: Template[] }) {
  const supabase = await createClient();
  const instId = str(sp.institucion);
  const template = templates.find((t) => t.id === str(sp.plantilla));
  const { data: meId } = await supabase.rpc("current_profile_id");
  const [{ data: institutions }, { data: me }, { data: conn }, inst, { data: links }] = await Promise.all([
    // shortcut: carga todas las instituciones visibles para el buscador; paginar si pasan de ~5 mil.
    supabase.from("institutions").select("id, name").order("name"),
    supabase.from("profiles").select("full_name, email").eq("id", meId).maybeSingle(),
    supabase.from("google_connections").select("google_email, scopes").maybeSingle(),
    instId ? supabase.from("institutions").select("id, name, city, email").eq("id", instId).maybeSingle() : Promise.resolve({ data: null }),
    instId ? supabase.from("institution_contacts").select("contact_id, job_title, is_primary").eq("institution_id", instId) : Promise.resolve({ data: [] }),
  ]);
  const ids = (links ?? []).map((l) => l.contact_id);
  const { data: people } = ids.length
    ? await supabase.from("contacts").select("id, first_name, last_name, email").in("id", ids).eq("status", "active")
    : { data: [] };
  const contacts = (people ?? []).map((p) => ({ ...p, link: (links ?? []).find((l) => l.contact_id === p.id)! }))
    .sort((a, b) => Number(b.link.is_primary) - Number(a.link.is_primary));
  const contact = contacts.find((c) => c.id === str(sp.contacto)) ?? contacts[0];
  const institution = inst.data as { id: string; name: string; city: string | null; email: string | null } | null;

  const values = {
    nombre_institucion: institution?.name, ciudad: institution?.city,
    contacto: contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
    nombre_contacto: contact?.first_name, cargo_contacto: contact?.link.job_title, mi_nombre: me?.full_name || null,
  };
  const subject = template ? fillTemplate(template.subject, values) : null;
  const body = template ? fillTemplate(template.body, values) : null;
  const missing = [...new Set([...(subject?.missing ?? []), ...(body?.missing ?? [])])];
  const canSend = Boolean(googleEnv() && conn?.scopes?.includes("gmail.send"));

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <form className="h-fit space-y-4 rounded-xl border border-border bg-background p-5 shadow-sm">
        <input type="hidden" name="ver" value="redactar" />
        <h2 className="font-semibold">1. Elige plantilla y destinatario</h2>
        <SelectField label="Plantilla" name="plantilla" defaultValue={template?.id ?? ""}
          options={[{ value: "", label: "Sin plantilla (correo en blanco)" }, ...templates.map((t) => ({ value: t.id, label: t.title }))]} />
        <ComboField label="Institución" name="institucion" defaultValue={institution?.id ?? ""} placeholder="Escribe el nombre"
          options={(institutions ?? []).map((i) => ({ value: i.id, label: i.name }))} />
        {contacts.length > 1 && (
          <SelectField label="Contacto" name="contacto" defaultValue={contact?.id}
            options={contacts.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`.trim() + (c.link.is_primary ? " (principal)" : "") }))} />
        )}
        <Button type="submit" className="w-full">Llenar el correo</Button>
        {institution && !contacts.length && <p className="text-xs text-muted-foreground">Esta institución no tiene contactos; se usa su correo general.</p>}
      </form>

      <section className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">2. Revisa y envía</h2>
          {template && <Pill tone={categoryTone[template.category]}>{template.title}</Pill>}
        </div>
        {institution && missing.length > 0 && (
          <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Faltan datos en el CRM: {missing.join(", ")}. Quedaron como {"{{…}}"} en el texto; escríbelos antes de enviar.
          </p>
        )}
        {!institution && template && <p className="text-sm text-muted-foreground">Elige la institución para llenar las variables.</p>}
        <ComposeForm key={`${template?.id}-${institution?.id}-${contact?.id}`}
          to={contact?.email ?? institution?.email ?? ""} subject={subject?.text ?? ""} body={body?.text ?? ""}
          institutionId={institution?.id} contactId={contact?.id} canSend={canSend} />
        <p className="text-xs text-muted-foreground">
          {canSend
            ? `Se envía desde ${conn?.google_email} y queda registrado en la ficha de la institución.`
            : "«Abrir en Gmail» abre el correo listo en tu Gmail para que lo envíes tú. El envío directo desde el CRM se activa cuando Google quede configurado y conectes tu cuenta en Integraciones."}
        </p>
      </section>
    </div>
  );
}
