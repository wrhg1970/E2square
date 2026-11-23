import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/modules/activities/time";
import { commissionBases, commissionKinds, commissionStatuses } from "@/modules/commissions/labels";
import { monthRange } from "@/modules/commissions/period";
import { toCsv } from "@/modules/reports/csv";

const MAX = 5000;

// Comisiones del mes para conciliar con nómina. RLS limita lo que ve cada quien; log_export exige reports.export y deja rastro.
export async function GET(request: Request) {
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const supabase = await createClient();
  const [{ data: meId }, profiles, products] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.from("profiles").select("id, full_name, email, timezone"),
    supabase.from("products").select("id, name, supplier_id"),
  ]);
  const tz = (profiles.data ?? []).find((p) => p.id === meId)?.timezone ?? "America/Mexico_City";
  const period = monthRange(sp.mes, tz);
  const status = sp.estado in commissionStatuses ? sp.estado : null;

  let q = supabase.from("commissions")
    .select("created_at, profile_id, opportunity_id, product_id, basis, base_amount, rate_pct, amount, currency_code, status, decided_by, decided_at, paid_at, decision_note, kind, share_pct")
    .gte("created_at", period.from).lt("created_at", period.to).order("created_at").limit(MAX);
  if (status) q = q.eq("status", status);
  const { data: rows, error } = await q;
  if (error) return new Response("No se pudo generar la exportación.", { status: 500 });
  const { error: auditError } = await supabase.rpc("log_export", { kind: "comisiones", row_count: rows.length, filters: { mes: period.month, estado: status ?? "all" } });
  if (auditError) return new Response("No tienes permiso para exportar.", { status: 403 });

  const oppIds = [...new Set(rows.map((r) => r.opportunity_id).filter(Boolean))];
  const { data: opps } = oppIds.length ? await supabase.from("opportunities").select("id, name").in("id", oppIds) : { data: [] };
  const oppName = new Map((opps ?? []).map((o) => [o.id, o.name]));
  const person = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const raw = new Map((products.data ?? []).map((p) => [p.id, p.name]));
  const product = new Map((products.data ?? []).map((p) => [p.id, p.supplier_id ? `${raw.get(p.supplier_id)} · ${p.name}` : p.name]));
  const when = (iso: string | null) => (iso ? formatDateTime(iso, tz) : "");

  const body = toCsv([
    ["Fecha", "Agente", "Oportunidad", "Producto", "Tipo", "Reparto %", "Base", "Monto base", "%", "Comisión", "Moneda", "Estado", "Aprobó", "Fecha de decisión", "Fecha de pago", "Nota"],
    ...rows.map((r) => [
      when(r.created_at), person.get(r.profile_id) ?? "", (r.opportunity_id && oppName.get(r.opportunity_id)) || "", (r.product_id && product.get(r.product_id)) || "",
      commissionKinds[r.kind as keyof typeof commissionKinds], Number(r.share_pct),
      r.basis ? commissionBases[r.basis as keyof typeof commissionBases] : "", r.base_amount === null ? "" : Number(r.base_amount),
      r.rate_pct === null ? "" : Number(r.rate_pct), Number(r.amount), r.currency_code,
      commissionStatuses[r.status as keyof typeof commissionStatuses], r.decided_by ? person.get(r.decided_by) ?? "" : "",
      when(r.decided_at), when(r.paid_at), r.decision_note ?? "",
    ]),
    ...(rows.length === MAX ? [[`Se exportaron las primeras ${MAX} comisiones del mes.`]] : []),
  ]);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="comisiones-${period.month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
