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

export const DEFAULT_MODELS = { anthropic: "claude-opus-5-5", gemini: "gemini-2.5-flash" } as const;
export const providerLabel = { anthropic: "Claude (Anthropic)", gemini: "Gemini (Google)" } as const;
