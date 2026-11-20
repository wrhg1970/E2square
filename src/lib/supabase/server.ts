import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";

export async function createClient() {
  const env = publicEnv();
  // Datos por usuario: siempre en tiempo de solicitud (supabase-js usa Date.now() al leer la sesión).
  await connection();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el refresco de sesión lo hará el proxy en Fase 1.
        }
      },
    },
  });
}
