import Link from "next/link";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/modules/activities/time";
import { actionLabels, auditTables, changes, FINANCE_FILTER } from "@/modules/audit/diff";
import { auditFilters, auditQuery } from "@/modules/audit/query";
import { buttonVariants } from "@/components/ui/button";

const PAGE = 50;
const recordHref: Record<string, string> = { institutions: "/instituciones/", opportunities: "/oportunidades/" };

type Entry = {
  id: number; actor_auth_user_id: string | null; table_name: string; record_id: string | null;
  action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string;
};

export default async function AuditPage({ searchParams }: PageProps<"/administracion/bitacora">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: canRead }, { data: meId }] = await Promise.all([
    supabase.rpc("has_permission", { permission: "audit.read" }),
    supabase.rpc("current_profile_id"),
  ]);
  if (!canRead) return <p role="alert" className="text-sm text-red-700">No tienes permiso para consultar la bitácora.</p>;

  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle();
  const tz = me?.timezone ?? "America/Mexico_City";
  const filters = auditFilters(sp, tz);
  const { from, to, table, record } = filters;
  const page = Math.max(0, Number.parseInt(String(sp.pagina ?? "0"), 10) || 0);

  const q = auditQuery(supabase, filters, tz).range(page * PAGE, page * PAGE + PAGE); // uno de más para saber si hay otra página
  const [log, profiles] = await Promise.all([q, supabase.from("profiles").select("auth_user_id, full_name, email")]);

  if (log.error) return <p role="alert" className="text-sm text-red-700">No se pudo cargar la bitácora. Recarga la página.</p>;
  const rows = (log.data ?? []) as Entry[];
  const hasMore = rows.length > PAGE;
  const actor = new Map((profiles.data ?? []).map((p) => [p.auth_user_id, p.full_name || p.email]));
  const params = (p: number) => new URLSearchParams({ desde: from, hasta: to, ...(table && { tabla: table }), ...(record && { registro: record }), pagina: String(p) });

  return (
    <div className="space-y-6">
      <div className="on-band page-header">
        <Link href="/administracion" className="text-sm text-muted-foreground hover:underline">← Administración</Link>
        <h1 className="mt-1 text-2xl font-semibold">Bitácora de auditoría</h1>
        <p className="text-sm text-muted-foreground">Quién cambió qué y cuándo: instituciones, oportunidades, montos, etapas, metas y permisos.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <Field label="Desde" name="desde" type="date" defaultValue={from} className="w-40" />
        <Field label="Hasta" name="hasta" type="date" defaultValue={to} className="w-40" />
        <SelectField label="Módulo" name="tabla" defaultValue={table}
          options={[{ value: "", label: "Todos" }, { value: FINANCE_FILTER, label: "Financiero (montos, precios, tipos de cambio, comisiones)" },
            ...Object.entries(auditTables).map(([value, label]) => ({ value, label }))]} />
        {record && <input type="hidden" name="registro" value={record} />}
        <button type="submit" className={buttonVariants({ variant: "outline" })}>Aplicar</button>
        {record && <Link href={`?${new URLSearchParams({ desde: from, hasta: to })}`} className="text-sm hover:underline">Quitar filtro de registro</Link>}
        <a href={`/administracion/bitacora/exportar?${params(0)}`} className={buttonVariants({ variant: "outline" })}>Exportar CSV</a>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cambios registrados con estos filtros.</p>
      ) : (
        <div className="table-card"><table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-2 pr-4 font-medium">Fecha</th>
              <th className="py-2 pr-4 font-medium">Usuario</th>
              <th className="py-2 pr-4 font-medium">Módulo</th>
              <th className="py-2 pr-4 font-medium">Acción</th>
              <th className="py-2 pr-4 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((r) => {
              const detail = changes(r.old_data, r.new_data);
              const href = r.record_id && r.action !== "DELETE" ? recordHref[r.table_name] : undefined;
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(r.created_at, tz)}</td>
                  <td className="py-2 pr-4">{(r.actor_auth_user_id && actor.get(r.actor_auth_user_id)) || "Sistema"}</td>
                  <td className="py-2 pr-4">
                    {href ? <Link href={`${href}${r.record_id}`} className="hover:underline">{auditTables[r.table_name]}</Link> : auditTables[r.table_name] ?? r.table_name}
                  </td>
                  <td className="py-2 pr-4">{actionLabels[r.action] ?? r.action}</td>
                  <td className="py-2 pr-4">
                    {detail.length === 0 ? "—" : (
                      <ul className="space-y-0.5 break-all">
                        {detail.slice(0, 8).map((d) => <li key={d}>{d}</li>)}
                        {detail.length > 8 && <li className="text-muted-foreground">y {detail.length - 8} campos más</li>}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}

      <nav className="flex gap-4 text-sm" aria-label="Páginas">
        {page > 0 && <Link href={`?${params(page - 1)}`} className="hover:underline">← Más recientes</Link>}
        {hasMore && <Link href={`?${params(page + 1)}`} className="hover:underline">Más antiguos →</Link>}
      </nav>
    </div>
  );
}
