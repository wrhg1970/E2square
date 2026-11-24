import type { ReactNode } from "react";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { institutionStatuses, institutionTypes, potentials, toOptions } from "./labels";

type Option = { value: string; label: string };
type Values = Partial<Record<string, string | number | null>>;

const v = (x: string | number | null | undefined) => (x == null ? "" : String(x));
const SOURCES = ["Feria educativa", "Referido", "Sitio web", "Llamada en frío", "Redes sociales", "Evento", "Base existente"];

function Group({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`space-y-3 rounded-xl border border-border bg-background shadow-sm p-4 ${className ?? ""}`}>
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

// Formulario de institución en bloques; en el alta incluye el contacto principal.
export function InstitutionFields({
  values = {},
  offices,
  owners,
  parents,
  withContact = false,
}: {
  values?: Values;
  offices: Option[];
  owners: Option[];
  parents: Option[];
  withContact?: boolean;
}) {
  // Cuadrícula por filas (no dos columnas sueltas): cada par de bloques queda a la misma altura.
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Group title="Identificación">
        <Field label="Nombre de la institución" name="name" defaultValue={v(values.name)} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sitio web" name="website" defaultValue={v(values.website)} placeholder="institucion.edu.mx" />
          <Field label="Teléfono" name="phone" type="tel" defaultValue={v(values.phone)} />
        </div>
        <Field label="Correo general" name="email" type="email" defaultValue={v(values.email)} />
      </Group>

      <Group title="Parámetros comerciales">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Tipo" name="institution_type" defaultValue={v(values.institution_type)} options={toOptions(institutionTypes, "Elige un tipo")} required />
          <SelectField label="Estatus" name="status" defaultValue={v(values.status) || "prospect"} options={toOptions(institutionStatuses)} />
          <Field label="Origen" name="source" list="institution-sources" defaultValue={v(values.source)} placeholder="Referido, feria…" />
          <SelectField label="Potencial" name="potential" defaultValue={v(values.potential)} options={toOptions(potentials, "Sin definir")} />
          <SelectField label="Responsable" name="owner_id" defaultValue={v(values.owner_id)} options={[{ value: "", label: values.owner_id ? "Sin cambio" : "Yo" }, ...owners]} />
          <SelectField label="Oficina" name="office_id" defaultValue={v(values.office_id)} options={[{ value: "", label: "Sin oficina" }, ...offices]} />
        </div>
        <datalist id="institution-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
      </Group>

      <Group title="Ubicación" className={withContact ? "" : "lg:col-span-2"}>
        <Field label="Calle y número" name="address" defaultValue={v(values.address)} />
        <div className={`grid gap-3 ${withContact ? "sm:grid-cols-[1fr_1fr_6rem]" : "sm:grid-cols-[1fr_1fr_8rem]"}`}>
          <Field label="Ciudad" name="city" defaultValue={v(values.city)} />
          <Field label="Estado / provincia" name="region" defaultValue={v(values.region)} />
          <Field label="País" name="country_code" defaultValue={v(values.country_code) || "MX"} maxLength={2} required title="Código de 2 letras, p. ej. MX" />
        </div>
      </Group>

      {withContact && (
        <Group title="Contacto principal (opcional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" name="contact_first_name" />
            <Field label="Apellidos" name="contact_last_name" />
            <Field label="Cargo" name="contact_job_title" placeholder="Directora general" />
            <Field label="Teléfono / WhatsApp" name="contact_phone" type="tel" />
            <Field label="Correo" name="contact_email" type="email" className="sm:col-span-2" />
          </div>
        </Group>
      )}

      <Group title="Notas" className="lg:col-span-2">
        <TextareaField label="Interés, contexto y próximos pasos" name="notes" defaultValue={v(values.notes)} maxLength={5000} placeholder="Qué les interesa, con quién hablaste, qué sigue…" />
      </Group>

      <details className="rounded-xl border border-border bg-background p-4 shadow-sm lg:col-span-2">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Datos fiscales y del grupo <span className="font-normal normal-case tracking-normal">· opcional</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Razón social" name="legal_name" defaultValue={v(values.legal_name)} />
          <Field label="Id. fiscal (RFC, NIT…)" name="tax_id" defaultValue={v(values.tax_id)} />
          <Field label="Alumnos / empleados" name="estimated_size" type="number" min={0} defaultValue={v(values.estimated_size)} />
          <Field label="Subtipo" name="subtype" defaultValue={v(values.subtype)} placeholder="Bilingüe, técnica…" />
          <SelectField label="Pertenece al grupo" name="parent_institution_id" defaultValue={v(values.parent_institution_id)} options={[{ value: "", label: "Ninguno" }, ...parents]} className="sm:col-span-2" />
        </div>
      </details>
    </div>
  );
}

export async function loadInstitutionOptions(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) {
  const [offices, owners, parents] = await Promise.all([
    supabase.from("offices").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
    supabase.from("institutions").select("id, name").in("institution_type", ["education_group", "company", "association"]).order("name").limit(500),
  ]);
  return {
    offices: (offices.data ?? []).map((o) => ({ value: o.id, label: o.name })),
    owners: (owners.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email })),
    parents: (parents.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  };
}
