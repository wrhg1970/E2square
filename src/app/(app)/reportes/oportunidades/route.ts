import { createClient } from "@/lib/supabase/server";
import { zonedToUtc } from "@/modules/activities/time";
import { opportunityStatuses } from "@/modules/opportunities/labels";
import { toCsv } from "@/modules/reports/csv";

const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const uuid = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

// Exporta las oportunidades visibles (RLS) vivas en el periodo. Solo con reports.export y siempre queda en auditoría.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = isDate(sp.get("desde")), to = isDate(sp.get("hasta"));
  const owner = uuid(sp.get("vendedor")), office = uuid(sp.get("oficina")), product = uuid(sp.get("producto"));
  const supabase = await createClient();
  const { data: meId } = await supabase.rpc("current_profile_id");
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle();
  const tz = me?.timezone ?? "America/Mexico_City";
  // Límites del periodo en la zona del usuario (igual que el dashboard).
  const dayAfter = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  let q = supabase
    .from("opportunity_facts")
    .select("id, name, institution_id, owner_id, status, currency_code, amount, cost, margin, probability, expected_close_date, closed_at, created_at, stage_id, product_id")
    .order("created_at")
    .limit(10000);
  if (to) q = q.lt("created_at", zonedToUtc(`${dayAfter(to)}T00:00`, tz).toISOString());
  if (from) q = q.or(`closed_at.is.null,closed_at.gte.${zonedToUtc(`${from}T00:00`, tz).toISOString()}`);
  if (owner) q = q.eq("owner_id", owner);
  if (office) q = q.eq("office_id", office);
  if (product) q = q.eq("product_id", product);
  const { data: rows, error } = await q;
  if (error) return new Response("No se pudo generar el reporte.", { status: 500 });

  const { error: auditError } = await supabase.rpc("log_export", {
    kind: "oportunidades",
    row_count: rows.length,
    filters: { from, to, owner, office, product },
  });
  if (auditError) return new Response("No tienes permiso para exportar.", { status: 403 });

  const ids = (k: "institution_id" | "owner_id" | "stage_id" | "product_id") => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const [insts, owners, stages, products] = await Promise.all([
    supabase.from("institutions").select("id, name").in("id", ids("institution_id")),
    supabase.from("profiles").select("id, full_name, email").in("id", ids("owner_id")),
    supabase.from("pipeline_stages").select("id, name").in("id", ids("stage_id")),
    supabase.from("products").select("id, name").in("id", ids("product_id")),
  ]);
  const names = new Map<string, string>([
    ...[...(insts.data ?? []), ...(stages.data ?? []), ...(products.data ?? [])].map((x) => [x.id, x.name] as [string, string]),
    ...(owners.data ?? []).map((p) => [p.id, p.full_name ?? p.email] as [string, string]),
  ]);
  const n = (id: string | null) => (id ? names.get(id) ?? "" : "");

  const body = toCsv([
    ["Oportunidad", "Institución", "Producto", "Etapa", "Estado", "Responsable", "Moneda", "Monto", "Costo", "Margen", "Probabilidad", "Cierre estimado", "Cerrada", "Creada"],
    ...rows.map((r) => [
      r.name, n(r.institution_id), n(r.product_id), n(r.stage_id), opportunityStatuses[r.status as keyof typeof opportunityStatuses] ?? r.status,
      n(r.owner_id), r.currency_code, Number(r.amount), Number(r.cost), Number(r.margin), r.probability, r.expected_close_date,
      r.closed_at?.slice(0, 10), r.created_at.slice(0, 10),
    ]),
  ]);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="oportunidades-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
