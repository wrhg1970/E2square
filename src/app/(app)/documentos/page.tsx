import Link from "next/link";
import { Download, FileText, Pencil, Search } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
import { ComboField } from "@/components/ui/combo-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Pill, type PillTone } from "@/components/ui/pill";
import { FormBlock, Reveal } from "@/components/ui/reveal";
import { StatTile } from "@/components/ui/stat-tile";
import { createClient } from "@/lib/supabase/server";
import { dayIn, formatDay } from "@/modules/activities/time";
import { deleteDocument, updateDocument, uploadFromRepository } from "@/modules/documents/actions";
import { EmailButton } from "@/modules/documents/email-button";
import {
  ACCEPT_ATTR, documentCategories, formatSize, matchesValidity, validityFilters, validityLabel, validityOf, type Validity,
} from "@/modules/documents/rules";
import { searchTerm } from "@/modules/institutions/schemas";

type Row = {
  id: string; root_id: string; file_name: string; size_bytes: number; category: string; version: number; created_at: string; uploaded_by: string;
  title?: string | null; description?: string | null; expires_on?: string | null;
  institution_id: string | null; opportunity_id: string | null; product_id: string | null; campaign_id: string | null;
  institutions: { name: string } | null; opportunities: { name: string } | null; products: { name: string } | null; campaigns: { name: string } | null;
};

const BASE_COLS = "id, root_id, file_name, size_bytes, category, version, created_at, uploaded_by, institution_id, opportunity_id, product_id, campaign_id, institutions(name), opportunities(name), products(name), campaigns(name)";
const categoryTone: Record<string, PillTone> = { contract: "violet", proposal: "teal", accreditation: "sky", legal: "amber", presentation: "sky", price_list: "amber", material: "slate", other: "slate" };
const validityTone: Record<Validity["kind"], PillTone> = { valid: "teal", soon: "amber", expired: "red", none: "slate" };
const categoryOptions = Object.entries(documentCategories).map(([value, label]) => ({ value, label }));
const iconBtn = "grid size-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50";
const control = "h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

// Dónde vive cada documento, con enlace a su ficha; sin vínculo es de la empresa.
function linkOf(d: Row) {
  if (d.opportunity_id) return { href: `/oportunidades/${d.opportunity_id}`, kind: "Oportunidad", label: d.opportunities?.name ?? "—" };
  if (d.institution_id) return { href: `/instituciones/${d.institution_id}`, kind: "", label: d.institutions?.name ?? "—" };
  if (d.campaign_id) return { href: `/campanas/${d.campaign_id}`, kind: "Campaña", label: d.campaigns?.name ?? "—" };
  if (d.product_id) return { href: `/productos/${d.product_id}`, kind: "Proveedor", label: d.products?.name ?? "—" };
  return null;
}

export default async function DocumentsPage({ searchParams }: PageProps<"/documentos">) {
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const category = typeof sp.categoria === "string" && sp.categoria in documentCategories ? sp.categoria : "";
  const vigencia = typeof sp.vigencia === "string" && sp.vigencia in validityFilters ? (sp.vigencia as keyof typeof validityFilters) : "";
  const editing = typeof sp.editar === "string" ? sp.editar : "";
  const supabase = await createClient();
  // La RLS deja ver solo documentos de lo que el usuario puede ver.
  // shortcut: trae hasta 1,000 versiones y filtra aquí; con más documentos, filtrar y paginar en la base.
  const load = (cols: string) => supabase.from("documents").select(cols).order("version", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  let res = await load(`${BASE_COLS}, title, description, expires_on`);
  const hasValidity = res.error?.code !== "42703";
  if (!hasValidity) res = await load(BASE_COLS); // sin la migración de vigencia todavía

  const [{ data: meId }, { data: isAdmin }, { data: canWrite }, { data: profiles }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "admin.structure" }),
    supabase.rpc("has_permission", { permission: "institutions.write" }),
    supabase.from("profiles").select("id, full_name, timezone"),
  ]);
  const { data: institutions } = canWrite ? await supabase.from("institutions").select("id, name").order("name").limit(2000) : { data: [] };
  const people = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const today = dayIn(new Date(), (profiles ?? []).find((p) => p.id === meId)?.timezone ?? "America/Mexico_City");

  // Solo la versión más reciente de cada documento (vienen ordenadas de mayor a menor versión).
  const seen = new Set<string>();
  const latest = ((res.data ?? []) as unknown as Row[]).filter((d) => !seen.has(d.root_id) && seen.add(d.root_id));
  const withValidity = latest.map((d) => ({ ...d, validity: validityOf(d.expires_on, today) }));
  const count = (k: Validity["kind"]) => withValidity.filter((d) => d.validity.kind === k).length;
  const needle = q.toLowerCase();
  const docs = withValidity.filter((d) =>
    (!needle || [d.title, d.file_name, d.description, linkOf(d)?.label ?? "General / Corporativo"].some((t) => t?.toLowerCase().includes(needle)))
    && (!category || d.category === category) && (!vigencia || matchesValidity(d.validity, vigencia)));
  const filtered = Boolean(q || category || vigencia);
  const editHref = (id: string) => {
    const u = new URLSearchParams(Object.entries({ q, categoria: category, vigencia, editar: id }).filter(([, v]) => v) as [string, string][]);
    return `/documentos${u.size ? `?${u}` : ""}#doc-${id}`;
  };
  const canEdit = (d: Row) => hasValidity && (d.uploaded_by === meId || Boolean(isAdmin));

  const uploadForm = canWrite && (
    <ActionForm action={uploadFromRepository} submitLabel="Subir documento" className="space-y-5">
      <FormBlock title="Archivo" cols={2}>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Archivo (máx. 15 MB)</span>
          <input type="file" name="file" accept={ACCEPT_ATTR} required className="max-w-full text-sm text-muted-foreground file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted" />
        </label>
        <Field label="Título" name="title" maxLength={200} placeholder="Convenio marco 2027" />
      </FormBlock>
      <FormBlock title="Clasificación y vigencia" cols={3}>
        <SelectField label="Categoría" name="category" defaultValue="contract" options={categoryOptions} />
        <ComboField label="Institución" name="institution_id" placeholder="Vacío = General / Corporativo"
          options={(institutions ?? []).map((i) => ({ value: i.id, label: i.name }))} />
        <Field label="Vence el" name="expires_on" type="date" />
      </FormBlock>
      <TextareaField label="Descripción" name="description" maxLength={1000} placeholder="Para qué sirve o qué contiene" />
      <p className="text-xs text-muted-foreground">Deja «Vence el» vacío si el documento no caduca. Para ligarlo a una oportunidad, proveedor o campaña, súbelo desde su ficha.</p>
    </ActionForm>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-muted-foreground">Contratos, propuestas, acreditaciones y documentos de la empresa, con su vigencia.</p>
        </div>
        {latest.length > 0 && (
          <div className="on-light grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Documentos" value={latest.length} hint="En el repositorio" />
            <StatTile label="Vigentes" value={count("valid")} tone={count("valid") ? "good" : "default"} hint="Más de 30 días por delante" />
            <StatTile label="Por vencer" value={count("soon")} tone={count("soon") ? "warn" : "default"} hint="En 30 días o menos" />
            <StatTile label="Vencidos" value={count("expired")} tone={count("expired") ? "alert" : "default"} hint="Por renovar" />
          </div>
        )}
      </div>

      {res.error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar los documentos. Recarga la página.</p>
      ) : latest.length === 0 ? (
        <EmptyState icon={FileText} title="Todavía no hay documentos"
          action={uploadForm ? <div className="w-full max-w-4xl text-left"><Reveal label="Subir el primer documento" title="Subir documento">{uploadForm}</Reveal></div> : undefined}>
          Guarda aquí contratos, propuestas, acreditaciones y documentos de la empresa, con la fecha en que vencen para saber qué renovar.
          También puedes subirlos desde la ficha de una institución, oportunidad, proveedor o campaña.
        </EmptyState>
      ) : (
        <>
          <form role="search" className="flex flex-wrap items-end gap-3">
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Buscar documento</span>
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" name="q" defaultValue={q} placeholder="Buscar título, archivo o institución" className={`${control} w-full pl-8`} />
            </label>
            <select name="categoria" defaultValue={category} aria-label="Categoría" className={control}>
              <option value="">Todas las categorías</option>
              {categoryOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select name="vigencia" defaultValue={vigencia} aria-label="Vigencia" className={control}>
              <option value="">Todas las vigencias</option>
              {Object.entries(validityFilters).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <button type="submit" className={buttonVariants({ variant: "outline" })}>Filtrar</button>
            {filtered && <Link href="/documentos" className="text-sm underline">Quitar filtros</Link>}
          </form>
          {uploadForm && <Reveal label="Subir documento" title="Subir documento">{uploadForm}</Reveal>}
          {!hasValidity && <p role="status" className="text-sm text-amber-700">La vigencia, el título y la descripción se activan al terminar de actualizar la base de datos.</p>}

          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún documento coincide con los filtros. <Link href="/documentos" className="underline">Quitar filtros</Link></p>
          ) : (
            <div className="table-card"><table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>{["Documento", "Fecha de carga", "Categoría", "Institución", "Vigencia", "Subido por", "Acciones"].map((h) => <th key={h} className="whitespace-nowrap py-2 pr-4 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const link = linkOf(d);
                  const name = d.title || d.file_name;
                  return [
                    <tr key={d.id} id={`doc-${d.id}`} className="border-t border-border align-top">
                      <td className="max-w-80 py-3 pr-4">
                        <div className="flex gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-teal-700"><FileText aria-hidden className="size-4" /></span>
                          <div className="min-w-0">
                            <a href={`/documentos/${d.id}`} className="font-semibold hover:underline">{name}</a>
                            {d.version > 1 && <span className="ml-1.5 rounded bg-muted px-1.5 text-xs">v{d.version}</span>}
                            <p className="truncate font-mono text-xs text-muted-foreground">{d.title ? `${d.file_name} · ` : ""}{formatSize(d.size_bytes)}</p>
                            {d.description && <p className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">{d.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums">{formatDay(dayIn(new Date(d.created_at), "America/Mexico_City"))}</td>
                      <td className="py-3 pr-4"><Pill tone={categoryTone[d.category]}>{documentCategories[d.category as keyof typeof documentCategories] ?? d.category}</Pill></td>
                      <td className="py-3 pr-4">
                        {link ? <>{link.kind && <span className="text-xs text-muted-foreground">{link.kind} · </span>}<Link href={link.href} className="hover:underline">{link.label}</Link></>
                          : <span className="text-muted-foreground">General / Corporativo</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4">
                        <Pill tone={validityTone[d.validity.kind]}>{validityLabel(d.validity)}</Pill>
                        {d.expires_on && <p className="mt-1 text-xs text-muted-foreground">Vence: {formatDay(d.expires_on)}</p>}
                      </td>
                      <td className="py-3 pr-4">{people.get(d.uploaded_by) ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <div className="flex gap-1.5">
                          <EmailButton id={d.id} title={name} className={iconBtn} />
                          <a href={`/documentos/${d.id}`} aria-label={`Descargar ${name}`} title="Descargar" className={iconBtn}><Download aria-hidden className="size-4" /></a>
                          {canEdit(d) && (
                            <Link href={editing === d.id ? "/documentos" : editHref(d.id)} aria-label={`Editar ${name}`} title="Editar" aria-expanded={editing === d.id} className={iconBtn}>
                              <Pencil aria-hidden className="size-4" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>,
                    editing === d.id && canEdit(d) && (
                      <tr key={`${d.id}-edit`} className="bg-muted/40">
                        <td colSpan={7} className="px-4 py-4">
                          <ActionForm action={updateDocument} submitLabel="Guardar cambios" className="space-y-4">
                            <input type="hidden" name="id" value={d.id} />
                            <FormBlock title={`Editar ${d.file_name}`} cols={3}>
                              <Field label="Título" name="title" maxLength={200} defaultValue={d.title ?? ""} />
                              <SelectField label="Categoría" name="category" defaultValue={d.category} options={categoryOptions} />
                              <Field label="Vence el" name="expires_on" type="date" defaultValue={d.expires_on ?? ""} />
                            </FormBlock>
                            <TextareaField label="Descripción" name="description" maxLength={1000} defaultValue={d.description ?? ""} />
                          </ActionForm>
                          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
                            <Link href="/documentos" className="underline">Cerrar</Link>
                            {link && <Link href={link.href} className="underline">Subir una nueva versión desde su ficha</Link>}
                            <form action={deleteDocument} className="ml-auto">
                              <input type="hidden" name="id" value={d.id} />
                              <button type="submit" className="text-red-700 underline">Eliminar {d.version > 1 ? `la versión ${d.version}` : "el documento"}</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}
