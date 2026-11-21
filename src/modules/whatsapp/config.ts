import { z } from "zod";

// Token de sistema de Meta (solo servidor). Sin él, el CRM recibe mensajes pero no envía.
const schema = z.object({ WHATSAPP_ACCESS_TOKEN: z.string().min(20) });

export function whatsappEnv(env: Record<string, string | undefined> = process.env) {
  const r = schema.safeParse(env);
  return r.success ? r.data : null;
}

export const GRAPH_URL = "https://graph.facebook.com/v23.0";
