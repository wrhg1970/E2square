import { ActionForm } from "@/components/ui/action-form";
import { createClient } from "@/lib/supabase/server";
import { createInstitution } from "@/modules/institutions/actions";
import { InstitutionFields, loadInstitutionOptions } from "@/modules/institutions/institution-fields";

export default async function NewInstitutionPage() {
  const options = await loadInstitutionOptions(await createClient());
  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nueva institución</h1>
      <ActionForm action={createInstitution} submitLabel="Crear institución">
        <InstitutionFields {...options} withContact />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm_duplicates" /> Crear aunque parezca duplicada
        </label>
      </ActionForm>
    </div>
  );
}
