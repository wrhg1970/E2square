export const instant = false;

import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { signIn } from "@/modules/auth/actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
      {error === "enlace" && (
        <p role="alert" className="text-sm text-red-700">
          El enlace no es válido o ya expiró. Solicita uno nuevo.
        </p>
      )}
      <ActionForm action={signIn} submitLabel="Entrar">
        <Field label="Correo" name="email" type="email" autoComplete="email" required />
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      </ActionForm>
      <Link href="/recuperar" className="text-sm underline">
        ¿Olvidaste tu contraseña?
      </Link>
    </>
  );
}
