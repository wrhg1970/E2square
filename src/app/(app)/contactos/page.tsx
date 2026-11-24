import Link from "next/link";
import { Search, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { createClient } from "@/lib/supabase/server";
import { decisionRoles } from "@/modules/institutions/labels";
import { searchTerm } from "@/modules/institutions/schemas";

const LIMIT = 200;

export default async function ContactsPage({ searchParams }: PageProps<"/contactos">) {
  const q = searchTerm((await searchParams).q);
  const supabase = await createClient();
  let query = supabase.from("contacts").select("id, first_name, last_name, email, phone", { count: "exact" }).order("first_name").limit(LIMIT);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data: contacts, count, error } = await query;

  const ids = (contacts ?? []).map((c) => c.id);
  const { data: links } = ids.length
    ? await supabase.from("institution_contacts").select("contact_id, institution_id, job_title, decision_role").in("contact_id", ids)
    : { data: [] };
  const instIds = [...new Set((links ?? []).map((l) => l.institution_id))];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
          <p className="text-sm text-muted-foreground">
            {error ? "" : count ? `${count} ${count === 1 ? "persona" : "personas"}${q ? ` con «${q}»` : ""}` : "Las personas con las que hablas en cada institución"}
          </p>
        </div>
        <Link href="/instituciones" className={buttonVariants({ variant: "outline" })}>Agregar desde una institución</Link>
      </div>

      {(q || !!contacts?.length) && (
        <form role="search" className="flex flex-wrap items-center gap-3">
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Buscar contacto</span>
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" name="q" defaultValue={q} placeholder="Buscar por nombre o correo"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
          </label>
          {q && <Link href="/contactos" className="text-sm text-muted-foreground underline">Quitar búsqueda</Link>}
        </form>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar los contactos. Recarga la página.</p>
      ) : !contacts?.length && q ? (
        <p className="text-sm text-muted-foreground">Ningún contacto coincide con «{q}». Prueba con otra palabra o <Link href="/contactos" className="underline">quita la búsqueda</Link>.</p>
      ) : !contacts?.length ? (
        <EmptyState icon={Users} title="Todavía no hay contactos"
          action={<Link href="/instituciones" className={buttonVariants()}>Ir a Instituciones</Link>}>
          Cada contacto pertenece a una institución. Abre la ficha de un colegio o universidad y agrega ahí a la persona con su puesto y su papel en la decisión.
        </EmptyState>
      ) : (
        <>
          <div className="table-card">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>{["Nombre", "Institución y puesto", "Correo", "Teléfono"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const mine = (links ?? []).filter((l) => l.contact_id === c.id);
                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="py-2 pr-4 font-medium">
                        {mine[0] ? <Link href={`/instituciones/${mine[0].institution_id}`} className="hover:underline">{`${c.first_name} ${c.last_name}`.trim()}</Link> : `${c.first_name} ${c.last_name}`.trim()}
                      </td>
                      <td className="py-2 pr-4">
                        {mine.length === 0 ? <span className="text-muted-foreground">Sin institución</span> : mine.map((l) => (
                          <div key={l.institution_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
                            <Link href={`/instituciones/${l.institution_id}`} className="hover:underline">{instName.get(l.institution_id) ?? "Institución"}</Link>
                            {l.job_title && <span className="text-muted-foreground">{l.job_title}</span>}
                            {l.decision_role && <Pill tone={l.decision_role === "decision_maker" ? "teal" : "slate"}>{decisionRoles[l.decision_role as keyof typeof decisionRoles]}</Pill>}
                          </div>
                        ))}
                      </td>
                      <td className="py-2 pr-4">{c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : "—"}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(count ?? 0) > LIMIT && <p className="text-sm text-muted-foreground">Se muestran los primeros {LIMIT}. Usa el buscador para encontrar a alguien en particular.</p>}
        </>
      )}
    </div>
  );
}
