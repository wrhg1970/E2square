import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/modules/activities/time";
import { actionLabels, auditTables, changes } from "@/modules/audit/diff";
import { auditFilters, auditQuery } from "@/modules/audit/query";
import { toCsv } from "@/modules/reports/csv";

const MAX = 5000;

// Exporta la bitácora con los mismos filtros de la pantalla. Requiere audit.read y reports.export; la exportación queda auditada.
export async function GET(request: Request) {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const supabase = await createClient();
  const [{ data: canRead }, { data: meId }] = await Promise.all([
    supabase.rpc("has_permission", { permission: "audit.read" }),
    supabase.rpc("current_profile_id"),
  ]);
  if (!canRead) return new Response("No tienes permiso para consultar la bitácora.", { status: 403 });
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle();
  const tz = me?.timezone ?? "America/Mexico_City";
  const filters = auditFilters(sp, tz);

  const [{ data: rows, error }, profiles] = await Promise.all([
    auditQuery(supabase, filters, tz).limit(MAX),
    supabase.from("profiles").select("auth_user_id, full_name, email"),
  ]);
  if (error) return new Response("No se pudo generar la exportación.", { status: 500 });
  const { error: auditError } = await supabase.rpc("log_export", { kind: "bitacora", row_count: rows.length, filters });
  if (auditError) return new Response("No tienes permiso para exportar.", { status: 403 });

  const actor = new Map((profiles.data ?? []).map((p) => [p.auth_user_id, p.full_name || p.email]));
  const body = toCsv([
    ["Fecha", "Usuario", "Módulo", "Acción", "Registro", "Detalle"],
    ...rows.map((r) => [
      formatDateTime(r.created_at, tz), (r.actor_auth_user_id && actor.get(r.actor_auth_user_id)) || "Sistema",
      auditTables[r.table_name] ?? r.table_name, actionLabels[r.action] ?? r.action, r.record_id,
      changes(r.old_data, r.new_data).join(" | "),
    ]),
    ...(rows.length === MAX ? [[`Se exportaron las ${MAX} entradas más recientes; acota las fechas para ver el resto.`]] : []),
  ]);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bitacora-${filters.from}-a-${filters.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
