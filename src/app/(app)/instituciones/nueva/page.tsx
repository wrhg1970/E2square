import { createClient } from "@/lib/supabase/server";
import { aiEnv } from "@/modules/ai/config";
import { loadInstitutionOptions } from "@/modules/institutions/institution-fields";
import { NewInstitutionForm } from "@/modules/institutions/new-institution-form";

export default async function NewInstitutionPage() {
  const options = await loadInstitutionOptions(await createClient());
  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="on-band page-header text-2xl font-semibold tracking-tight">Nueva institución</h1>
      <NewInstitutionForm options={options} aiEnabled={aiEnv() !== null} />
    </div>
  );
}
