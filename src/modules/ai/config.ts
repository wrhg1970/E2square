import { z } from "zod";

// IA de texto con proveedor intercambiable (Will, 2026-11-20): Gemini o Claude, según AI_PROVIDER.
// Solo servidor: nunca con prefijo NEXT_PUBLIC_. Sin configuración, las funciones de IA se muestran como "pendiente".
const schema = z.discriminatedUnion("AI_PROVIDER", [
  z.object({ AI_PROVIDER: z.literal("anthropic"), ANTHROPIC_API_KEY: z.string().min(20), AI_MODEL: z.string().min(3).optional() }),
  z.object({ AI_PROVIDER: z.literal("gemini"), GEMINI_API_KEY: z.string().min(20), AI_MODEL: z.string().min(3).optional() }),
]);

export type AiEnv = z.infer<typeof schema>;

export function aiEnv(env: Record<string, string | undefined> = process.env): AiEnv | null {
  const r = schema.safeParse({ ...env, AI_MODEL: env.AI_MODEL || undefined });
  return r.success ? r.data : null;
}

// Google limitó 2.5 a quien ya lo usaba (404 en proyectos nuevos, sep-2026); 3.8 Flash es su recomendado.
export const DEFAULT_MODELS = { anthropic: "claude-opus-5-5", gemini: "gemini-3.8-flash" } as const;
export const providerLabel = { anthropic: "Claude (Anthropic)", gemini: "Gemini (Google)" } as const;

// Haiku no admite la búsqueda web con filtrado dinámico (20260209); usa la versión básica.
export function webSearchType(model: string) {
  return model.startsWith("claude-haiku") ? ("web_search_20250305" as const) : ("web_search_20260209" as const);
}
