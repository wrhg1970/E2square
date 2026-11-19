import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Correo no válido")),
  password: z.string().min(1, "Escribe tu contraseña"),
});

export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Correo no válido")),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(10, "Usa al menos 10 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

// Solo rutas internas: evita redirecciones abiertas hacia otros sitios.
export function safeNextPath(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
