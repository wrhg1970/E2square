import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

// Mismas claves que public.institution_scores (AI_SPEC.md › Scoring). Sin atributos sensibles.
export const scoreFactors = {
  fit: "Ajuste institucional",
  need: "Necesidad",
  engagement: "Interacción",
  decision_access: "Acceso a decisores",
  budget: "Presupuesto",
  urgency: "Urgencia",
  recency: "Actividad reciente",
} as const;

const weight = z.coerce.number().int("Usa números enteros").min(0, "Mínimo 0").max(100, "Máximo 100");
export const scoreWeightsSchema = z
  .object(Object.fromEntries(Object.keys(scoreFactors).map((k) => [k, weight])) as Record<keyof typeof scoreFactors, typeof weight>)
  .refine((w) => Object.values(w).some((v) => v > 0), "Al menos un factor debe pesar más de 0");

export type ScoreFactor = { key: string; label: string; value: number; detail: string; weight: number };
export type InstitutionScore = { score: number | null; factors: ScoreFactor[]; computed_at: string };

export async function loadScores(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  if (!ids.length) return new Map<string, InstitutionScore>();
  const { data } = await supabase.rpc("institution_scores", { p_ids: ids });
  return new Map(((data ?? []) as (InstitutionScore & { institution_id: string })[]).map((r) => [r.institution_id, r]));
}

export const scoreTone = (s: number | null) =>
  s === null ? "bg-muted text-muted-foreground" : s >= 70 ? "bg-emerald-100 text-emerald-900" : s >= 40 ? "bg-amber-100 text-amber-900" : "bg-muted text-foreground";
