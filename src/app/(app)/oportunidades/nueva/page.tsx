import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { CURRENCIES } from "@/modules/catalog/labels";
import { createOpportunity } from "@/modules/opportunities/actions";

export default async function NewOpportunityPage({ searchParams }: PageProps<"/oportunidades/nueva">) {
  const { institucion, producto } = await searchParams;
  const supabase = await createClient();
  const [{ data: insts }, { data: products }, { data: owners }] = await Promise.all([
    supabase.from("institutions").select("id, name").order("name").limit(1000),
    supabase.from("products").select("id, name, default_pipeline_id, default_currency").eq("active", true).not("default_pipeline_id", "is", null).order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nueva oportunidad</h1>
      {!insts?.length ? (
        <p className="text-sm text-muted-foreground">Primero registra una institución.</p>
      ) : (
        <ActionForm action={createOpportunity} submitLabel="Crear oportunidad" className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Institución"
            name="institution_id"
            defaultValue={typeof institucion === "string" ? institucion : ""}
            options={[{ value: "", label: "Elige una institución" }, ...insts.map((i) => ({ value: i.id, label: i.name }))]}
            required
          />
          <SelectField
            label="Producto (pipeline)"
            name="pipeline_id"
            defaultValue={typeof producto === "string" ? producto : ""}
            options={[{ value: "", label: "Elige un producto" }, ...(products ?? []).map((p) => ({ value: p.default_pipeline_id!, label: p.name }))]}
            required
          />
          <Field label="Nombre" name="name" placeholder="TOEFL ciclo 2027" required />
          <SelectField label="Moneda" name="currency_code" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <Field label="Cierre estimado" name="expected_close_date" type="date" />
          <SelectField label="Responsable" name="owner_id" options={[{ value: "", label: "Yo" }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))]} />
          <Field label="Origen" name="source" />
          <Field label="Competidor" name="competitor" />
          <TextareaField label="Notas" name="notes" className="sm:col-span-2" />
        </ActionForm>
      )}
    </div>
  );
}
