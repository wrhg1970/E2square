"use server";

import { createClient } from "@/lib/supabase/server";
import { BRIEF_SYSTEM, opportunityBrief } from "./brief";
import { generateText } from "./provider";

export type BriefState = { text?: string; error?: string; at?: string };

// Lee con el cliente del usuario: RLS garantiza que la IA solo recibe lo que el usuario puede ver.
export async function summarizeOpportunity(id: string): Promise<BriefState> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Oportunidad no válida." };
  const supabase = await createClient();
  const { data: opp } = await supabase.from("opportunities")
    .select("id, name, institution_id, pipeline_id, stage_id, status, amount, currency_code, probability, expected_close_date").eq("id", id).maybeSingle();
  if (!opp) return { error: "No encontramos esa oportunidad." };
  const [inst, stage, supplier, items, acts] = await Promise.all([
    supabase.from("institutions").select("name").eq("id", opp.institution_id).maybeSingle(),
    supabase.from("pipeline_stages").select("name").eq("id", opp.stage_id).maybeSingle(),
    supabase.from("products").select("name").eq("default_pipeline_id", opp.pipeline_id).maybeSingle(),
    supabase.from("opportunity_items").select("product_id, quantity, line_total").eq("opportunity_id", id),
    supabase.from("activities").select("activity_type, subject, status, due_at, completed_at, outcome").eq("opportunity_id", id)
      .order("due_at", { ascending: false }).limit(15),
  ]);
  const productIds = [...new Set((items.data ?? []).map((i) => i.product_id))];
  const { data: products } = productIds.length ? await supabase.from("products").select("id, name").in("id", productIds) : { data: [] };
  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));

  const prompt = opportunityBrief({
    name: opp.name, institution: inst.data?.name ?? "—", supplier: supplier.data?.name ?? null, stage: stage.data?.name ?? null,
    status: opp.status, amount: Number(opp.amount), currency: opp.currency_code, probability: opp.probability,
    expectedClose: opp.expected_close_date, today: new Date().toISOString().slice(0, 10),
    items: (items.data ?? []).map((i) => ({ product: productName.get(i.product_id) ?? "Producto", quantity: Number(i.quantity), total: Number(i.line_total) })),
    activities: (acts.data ?? []).map((a) => ({ type: a.activity_type, subject: a.subject, status: a.status,
      when: (a.completed_at ?? a.due_at)?.slice(0, 10) ?? null, outcome: a.outcome })),
  });
  const r = await generateText({ system: BRIEF_SYSTEM, prompt });
  return "text" in r ? { text: r.text, at: new Date().toISOString() } : { error: r.error };
}
