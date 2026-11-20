import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authUrl } from "@/modules/google/api";
import { googleEnv } from "@/modules/google/config";

// Inicia OAuth con Google. El "state" en cookie httpOnly evita que otro sitio inyecte una cuenta ajena.
export async function GET(request: NextRequest) {
  const env = googleEnv();
  const origin = request.nextUrl.origin;
  if (!env) return NextResponse.redirect(new URL("/integraciones?error=config", origin));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(env, `${origin}/api/google/callback`, state));
  res.cookies.set("g_oauth_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/api/google" });
  return res;
}
