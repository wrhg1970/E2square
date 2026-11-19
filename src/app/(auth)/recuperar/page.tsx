import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { requestPasswordReset } from "@/modules/auth/actions";

export default function RecoverPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
      <ActionForm action={requestPasswordReset} submitLabel="Enviar enlace">
        <Field label="Correo" name="email" type="email" autoComplete="email" required />
      </ActionForm>
      <Link href="/login" className="text-sm underline">
        Volver a iniciar sesión
      </Link>
    </>
  );
}
