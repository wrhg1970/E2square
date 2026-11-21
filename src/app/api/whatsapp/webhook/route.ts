import { createClient } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

// Webhook de WhatsApp Cloud API. Sin sesión ni service_role: la base verifica la firma de Meta con el App Secret guardado.
const anon = () => {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
};

// Meta confirma la URL con hub.mode=subscribe, hub.verify_token y hub.challenge.
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const challenge = p.get("hub.challenge") ?? "";
  if (p.get("hub.mode") !== "subscribe" || !/^[\w-]{1,200}$/.test(challenge)) return new Response("Bad request", { status: 400 });
  const { data } = await anon().rpc("whatsapp_verify", { p_token: p.get("hub.verify_token") ?? "" });
  return data === true ? new Response(challenge, { headers: { "content-type": "text/plain" } }) : new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (body.length > 1_000_000) return new Response("Too large", { status: 413 });
  const { data, error } = await anon().rpc("whatsapp_ingest", { p_body: body, p_signature: request.headers.get("x-hub-signature-256") ?? "" });
  // 5xx hace que Meta reintente; la inserción es idempotente por id de mensaje.
  if (error) return new Response("Error", { status: 500 });
  return data === -1 ? new Response("Invalid signature", { status: 401 }) : new Response("OK");
}
