import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/modules/auth/schemas";

// Destino de los enlaces de correo de Supabase (recuperación de contraseña).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/login?error=enlace", origin));
}
