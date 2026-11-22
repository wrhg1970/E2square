import type { createClient } from "@/lib/supabase/server";
import { addDays, dayIn, zonedToUtc } from "@/modules/activities/time";
import { auditTables, FINANCE_FILTER, FINANCE_TABLES } from "./diff";

type Params = Record<string, string | string[] | undefined>;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

// Filtros de la bitácora, compartidos por la pantalla y la exportación CSV.
export function auditFilters(sp: Params, tz: string) {
  const today = dayIn(new Date(), tz);
  const from = isDate(sp.desde) ? sp.desde : addDays(today, -30);
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const table = typeof sp.tabla === "string" && (sp.tabla in auditTables || sp.tabla === FINANCE_FILTER) ? sp.tabla : "";
  return { from, to, table, record: uuid(sp.registro) };
}

export function auditQuery(supabase: Awaited<ReturnType<typeof createClient>>, f: ReturnType<typeof auditFilters>, tz: string) {
  let q = supabase.from("audit_log")
    .select("id, actor_auth_user_id, table_name, record_id, action, old_data, new_data, created_at")
    .gte("created_at", zonedToUtc(`${f.from}T00:00`, tz).toISOString())
    .lt("created_at", zonedToUtc(`${addDays(f.to, 1)}T00:00`, tz).toISOString())
    .order("created_at", { ascending: false });
  if (f.table === FINANCE_FILTER) q = q.in("table_name", FINANCE_TABLES);
  else if (f.table) q = q.eq("table_name", f.table);
  if (f.record) q = q.eq("record_id", f.record);
  return q;
}
