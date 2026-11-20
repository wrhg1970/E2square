export type ActionState = { error?: string; success?: string; details?: string[] } | null;

// Traduce errores de Postgres/Supabase a mensajes para el usuario sin filtrar detalles internos.
export function dbErrorMessage(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case "EB001": // regla de negocio de la base, ya redactada para el usuario
      return error.message ?? "La operación no cumple las reglas del proceso.";
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
