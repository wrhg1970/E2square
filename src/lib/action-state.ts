export type ActionState = { error?: string; success?: string; details?: string[] } | null;

// Traduce errores de Postgres/Supabase a mensajes para el usuario sin filtrar detalles internos.
export function dbErrorMessage(error: { code?: string } | null): string {
  switch (error?.code) {
    case "42501":
      return "No tienes permiso para esta acción.";
    case "23505":
      return "Ya existe un registro con esos datos.";
    case "23503":
      return "Uno de los datos relacionados no es válido.";
    default:
      return "No se pudo guardar. Intenta de nuevo.";
  }
}
