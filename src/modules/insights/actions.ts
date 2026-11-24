"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { generateText } from "@/modules/ai/provider";
import { dayIn } from "@/modules/activities/time";
import { ASK_SYSTEM, parseAiSpec } from "./spec";



// La IA solo elige parámetros del menú; los datos se leen después con los permisos del usuario.
export async function askQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  if (question.length < 5) return { error: "Escribe tu pregunta." };
  const today = dayIn(new Date(), "America/Mexico_City");
  const r = await generateText({ system: ASK_SYSTEM, prompt: `Hoy es ${today}. Pregunta: ${question}` });
  if ("error" in r) return { error: r.error };
  const spec = parseAiSpec(r.text);
  if ("error" in spec) return { error: spec.error };
  redirect(`/consultas?${new URLSearchParams({ ...spec, pregunta: question })}`);
}
