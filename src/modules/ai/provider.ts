import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { aiEnv, DEFAULT_MODELS } from "./config";

export type AiResult = { text: string } | { error: string };

// Una sola llamada de texto. El llamador arma el prompt solo con datos que el usuario ya puede ver (RLS).
// webSearch: deja que el modelo busque en internet (Claude web_search / Gemini google_search).
export async function generateText({ system, prompt, webSearch = false }: { system: string; prompt: string; webSearch?: boolean }): Promise<AiResult> {
  const env = aiEnv();
  if (!env) return { error: "La IA aún no está configurada. El administrador debe registrar el proveedor y su clave." };
  const model = env.AI_MODEL ?? DEFAULT_MODELS[env.AI_PROVIDER];
  try {
    return env.AI_PROVIDER === "anthropic"
      ? await claude(env.ANTHROPIC_API_KEY, model, system, prompt, webSearch)
      : await gemini(env.GEMINI_API_KEY, model, system, prompt, webSearch);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "La clave de IA no es válida. Revisa la configuración." };
    if (e instanceof Anthropic.RateLimitError) return { error: "La IA está saturada. Intenta en un minuto." };
    if (e instanceof Anthropic.APIError) return { error: `La IA respondió con error ${e.status ?? ""}. Intenta más tarde.` };
    return { error: "No se pudo contactar a la IA. Intenta más tarde." };
  }
}

async function claude(apiKey: string, model: string, system: string, prompt: string, webSearch: boolean): Promise<AiResult> {
  const client = new Anthropic({ apiKey, timeout: 90_000 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const call = () => client.beta.messages.create({
    model,
    max_tokens: 4000,
    system,
    output_config: { effort: "low" },
    // Si el modelo declina por seguridad, el API reintenta con el modelo de respaldo por defecto.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...(webSearch ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 4 }] } : {}),
    messages,
  });
  let res = await call();
  // Una búsqueda larga puede pausar el turno: se reenvía tal cual para que el servidor continúe (una vez basta con max_uses 4).
  if (res.stop_reason === "pause_turn") {
    messages.push({ role: "assistant", content: res.content });
    res = await call();
  }
  if (res.stop_reason === "refusal") return { error: "La IA no pudo responder esta solicitud." };
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return text ? { text } : { error: "La IA no devolvió texto." };
}

async function gemini(apiKey: string, model: string, system: string, prompt: string, webSearch: boolean): Promise<AiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(webSearch ? { tools: [{ google_search: {} }] } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 401 || res.status === 403) return { error: "La clave de IA no es válida. Revisa la configuración." };
  if (res.status === 429) return { error: "La IA está saturada. Intenta en un minuto." };
  if (!res.ok) return { error: `La IA respondió con error ${res.status}. Intenta más tarde.` };
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  return text ? { text } : { error: "La IA no devolvió texto." };
}
