// Traduce el error de Supabase Auth a un mensaje útil (antes todo decía "contraseña incorrecta").
export function signInErrorMessage(error: { code?: string; status?: number; name?: string; message?: string }) {
  if (error.code === "email_not_confirmed") return "Tu correo no está confirmado. Pide al administrador que confirme tu usuario en Supabase.";
  if (error.code === "user_banned") return "Tu usuario está bloqueado. Contacta al administrador.";
  if (error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500)
    return "No hay conexión con el servidor de acceso. Revisa la URL de Supabase en .env.local o intenta más tarde.";
  if (error.status === 401 || /api key/i.test(error.message ?? "")) return "La llave de Supabase no es válida. Revisa NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.";
  if (error.status === 429) return "Demasiados intentos. Espera un minuto e intenta de nuevo.";
  return "Correo o contraseña incorrectos.";
}
