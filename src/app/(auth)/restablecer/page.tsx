import { ActionForm } from "@/components/ui/action-form";
import { Field } from "@/components/ui/field";
import { updatePassword } from "@/modules/auth/actions";

export default function ResetPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Nueva contraseña</h1>
      <ActionForm action={updatePassword} submitLabel="Guardar contraseña">
        <Field label="Contraseña nueva" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <Field label="Confirmar contraseña" name="confirm" type="password" autoComplete="new-password" required />
      </ActionForm>
    </>
  );
}
