import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode } from "@/modules/google/api";
import { googleEnv } from "@/modules/google/config";
import { encrypt } from "@/modules/google/crypto";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/integraciones?${q}`, origin));
    res.cookies.delete({ name: "g_oauth_state", path: "/api/google" });
    return res;
  };
  const env = googleEnv();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!env) return back("error=config");
  if (!code || !state || state !== request.cookies.get("g_oauth_state")?.value) return back("error=estado");

  try {
    const { refreshToken, email, scope } = await exchangeCode(env, code, `${origin}/api/google/callback`);
    const supabase = await createClient();
    const [{ data: orgId }, { data: me }] = await Promise.all([supabase.rpc("current_org_id"), supabase.rpc("current_profile_id")]);
    if (!orgId || !me) return back("error=sesion");
    const { error } = await supabase.from("google_connections").upsert(
      { organization_id: orgId, profile_id: me, google_email: email, refresh_token_enc: encrypt(refreshToken, env.GOOGLE_TOKEN_KEY), scopes: scope, connected_at: new Date().toISOString(), last_sync_at: null },
      { onConflict: "profile_id" },
    );
    return back(error ? "error=guardar" : "conectado=1");
  } catch {
    return back("error=google");
  }
}
