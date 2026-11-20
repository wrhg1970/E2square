import Link from "next/link";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { decisionRoles } from "@/modules/institutions/labels";
import { searchTerm } from "@/modules/institutions/schemas";

export default async function ContactsPage({ searchParams }: PageProps<"/contactos">) {
  const q = searchTerm((await searchParams).q);
  const supabase = await createClient();
  let query = supabase.from("contacts").select("id, first_name, last_name, email, phone").order("first_name").limit(200);
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data: contacts, error } = await query;

  const ids = (contacts ?? []).map((c) => c.id);
  const { data: links } = ids.length
    ? await supabase.from("institution_contacts").select("contact_id, institution_id, job_title, decision_role").in("contact_id", ids)
    : { data: [] };
  const instIds = [...new Set((links ?? []).map((l) => l.institution_id))];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="on-band page-header text-2xl font-semibold tracking-tight">Contactos</h1>
      <form role="search" className="flex max-w-md items-end gap-3">
        <Field label="Buscar" name="q" defaultValue={q} placeholder="Nombre o correo" className="flex-1" />
        <button type="submit" className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Buscar</button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar los contactos. Recarga la página.</p>
      ) : !contacts?.length ? (
        <p className="text-sm text-muted-foreground">{q ? "Ningún contacto coincide." : "Todavía no hay contactos. Agrégalos desde el expediente de una institución."}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>{["Nombre", "Correo", "Teléfono", "Instituciones"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-border align-top">
                <td className="py-2 pr-4 font-medium">{`${c.first_name} ${c.last_name}`.trim()}</td>
                <td className="py-2 pr-4">{c.email ?? "—"}</td>
                <td className="py-2 pr-4">{c.phone ?? "—"}</td>
                <td className="py-2 pr-4">
                  {(links ?? []).filter((l) => l.contact_id === c.id).map((l) => (
                    <div key={l.institution_id}>
                      <Link href={`/instituciones/${l.institution_id}`} className="underline">{instName.get(l.institution_id) ?? "Institución"}</Link>
                      {[l.job_title, l.decision_role && decisionRoles[l.decision_role as keyof typeof decisionRoles]].filter(Boolean).map((t) => ` · ${t}`)}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
