import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { Group } from "@/modules/institutions/institution-fields";
import { createOpportunity } from "@/modules/opportunities/actions";
import { OpportunityBasics } from "@/modules/opportunities/opportunity-basics";

const SOURCES = ["Feria educativa", "Referido", "Sitio web", "Llamada en frío", "Redes sociales", "Evento", "Cliente actual"];

export default async function NewOpportunityPage({ searchParams }: PageProps<"/oportunidades/nueva">) {
  const { institucion, producto, campana } = await searchParams;
  const supabase = await createClient();
  const [{ data: insts }, { data: products }, { data: owners }, { data: campaigns }] = await Promise.all([
    supabase.from("institutions").select("id, name, city").order("name").limit(5000),
    supabase.from("products").select("id, name, default_pipeline_id, default_currency").eq("active", true).not("default_pipeline_id", "is", null).order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("campaigns").select("id, name").eq("status", "active").order("start_date", { ascending: false }),
  ]);
  // Nombres repetidos se distinguen por ciudad para que el buscador no los confunda.
  const counts = new Map<string, number>();
  for (const i of insts ?? []) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
  const institutions = (insts ?? []).map((i) => ({ id: i.id, label: (counts.get(i.name) ?? 0) > 1 ? `${i.name} · ${i.city ?? "sin ciudad"}` : i.name }));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Nueva oportunidad</h1>
        <p className="text-sm text-muted-foreground">Entra al embudo en la primera etapa del proveedor. Los productos y montos se agregan en la siguiente pantalla.</p>
      </div>
      {!institutions.length ? (
        <div className="rounded-xl border border-border bg-background px-6 py-10 text-center shadow-sm">
          <p className="text-lg font-bold">Primero registra una institución</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Cada oportunidad pertenece a un colegio o institución.</p>
          <Link href="/instituciones/nueva" className={`${buttonVariants()} mt-4`}>Registrar institución</Link>
        </div>
      ) : (
        <ActionForm action={createOpportunity} submitLabel="Crear oportunidad" className="grid gap-4 lg:grid-cols-2">
          <Group title="La oportunidad">
            <OpportunityBasics
              institutions={institutions}
              providers={(products ?? []).map((p) => ({ pipelineId: p.default_pipeline_id!, name: p.name, currency: p.default_currency }))}
              institutionId={typeof institucion === "string" ? institucion : ""}
              pipelineId={typeof producto === "string" ? producto : ""}
            />
            <Field label="Nombre" name="name" placeholder="Viaje de promoción 2027" required />
          </Group>

          <Group title="Seguimiento">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Responsable" name="owner_id" options={[{ value: "", label: "Yo" }, ...(owners ?? []).map((o) => ({ value: o.id, label: o.full_name || o.email }))]} />
              <Field label="Cierre estimado" name="expected_close_date" type="date" />
              <Field label="Origen" name="source" list="opportunity-sources" placeholder="Referido, feria…" />
              <Field label="Competidor" name="competitor" placeholder="Si ya cotizan con otro" />
              {(campaigns ?? []).length > 0 && (
                <SelectField label="Campaña" name="source_campaign_id" defaultValue={typeof campana === "string" ? campana : ""} className="sm:col-span-2"
                  options={[{ value: "", label: "Ninguna" }, ...(campaigns ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
              )}
            </div>
            <datalist id="opportunity-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          </Group>

          <Group title="Notas" className="lg:col-span-2">
            <TextareaField label="Contexto y próximos pasos" name="notes" maxLength={5000} placeholder="Qué necesitan, número de alumnos, fechas que les interesan, qué sigue…" />
          </Group>
        </ActionForm>
      )}
    </div>
  );
}
