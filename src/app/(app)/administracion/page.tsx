import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addExchangeRate, createBusinessUnit, createCompany, createInvitation, createOffice, updateOrgSettings } from "@/modules/admin/actions";
import { CURRENCIES } from "@/modules/catalog/labels";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-muted-foreground">
        <tr>{headers.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border">
            {r.map((c, j) => <td key={j} className="py-2 pr-4">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

export default async function AdminPage() {
  const supabase = await createClient();
  const [companies, units, offices, profiles, roles, profileRoles, invitations, canStructure, canUsers, org, rates] = await Promise.all([
    supabase.from("companies").select("id, legal_name, tax_id, country_code, status").order("legal_name"),
    supabase.from("business_units").select("id, name, company_id").order("name"),
    supabase.from("offices").select("id, name, company_id, business_unit_id, country_code, timezone").order("name"),
    supabase.from("profiles").select("id, full_name, email, status").order("email"),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("profile_roles").select("profile_id, role_id"),
    supabase.from("invitations").select("id, email, role_id, accepted_at").order("created_at", { ascending: false }),
    supabase.rpc("has_permission", { permission: "admin.structure" }),
    supabase.rpc("has_permission", { permission: "admin.users" }),
    supabase.from("organizations").select("require_next_activity, reporting_currency").maybeSingle(),
    supabase.from("exchange_rates").select("id, base_currency, quote_currency, rate, effective_at").order("effective_at", { ascending: false }).limit(50),
  ]);

  if (companies.error) {
    return <p role="alert" className="text-sm text-red-700">No se pudo cargar la administración. Recarga la página.</p>;
  }

  const companyName = new Map((companies.data ?? []).map((c) => [c.id, c.legal_name]));
  const unitName = new Map((units.data ?? []).map((u) => [u.id, u.name]));
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]));
  const companyOptions = [{ value: "", label: "Elige una empresa" }, ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.legal_name }))];
  const roleOptions = [{ value: "", label: "Elige un rol" }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))];

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <Link href="/administracion/bitacora" className="text-sm hover:underline">Bitácora de auditoría</Link>
      </div>

      {canStructure.data && org.data && (
        <Section title="Reglas comerciales">
          <ActionForm action={updateOrgSettings} submitLabel="Guardar">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="require_next_activity" defaultChecked={org.data.require_next_activity} />
              Exigir próxima actividad: no se puede cerrar la última actividad pendiente de una oportunidad abierta sin programar otra
            </label>
            <SelectField label="Moneda de reporte (dashboard y metas)" name="reporting_currency" defaultValue={org.data.reporting_currency}
              options={currencyOptions} className="max-w-xs" />
          </ActionForm>
        </Section>
      )}

      <Section title="Tipos de cambio">
        <p className="text-sm text-muted-foreground">
          Se usa la tasa vigente a la fecha de cierre de cada venta. Si falta una tasa, el dashboard lo avisa en vez de inventar la conversión.
        </p>
        <Table
          headers={["Vigente desde", "Tasa"]}
          rows={(rates.data ?? []).map((r) => [r.effective_at, `1 ${r.base_currency} = ${Number(r.rate)} ${r.quote_currency}`])}
          empty="Todavía no hay tipos de cambio."
        />
        {canStructure.data && (
          <ActionForm action={addExchangeRate} submitLabel="Agregar tasa" className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <SelectField label="1 unidad de" name="base_currency" defaultValue="USD" options={currencyOptions} />
            <SelectField label="equivale en" name="quote_currency" defaultValue="MXN" options={currencyOptions} />
            <Field label="Tasa" name="rate" type="number" step="0.00000001" min="0" required />
            <Field label="Vigente desde" name="effective_at" type="date" required />
          </ActionForm>
        )}
      </Section>

      <Section title="Empresas">
        <Table
          headers={["Razón social", "Id. fiscal", "País", "Estado"]}
          rows={(companies.data ?? []).map((c) => [c.legal_name, c.tax_id ?? "—", c.country_code, c.status === "active" ? "Activa" : "Inactiva"])}
          empty="Todavía no hay empresas."
        />
        {canStructure.data && (
          <ActionForm action={createCompany} submitLabel="Agregar empresa" className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Razón social" name="legal_name" required />
            <Field label="Id. fiscal (opcional)" name="tax_id" />
            <Field label="País" name="country_code" placeholder="MX" maxLength={2} required />
          </ActionForm>
        )}
      </Section>

      <Section title="Unidades de negocio">
        <Table
          headers={["Unidad", "Empresa"]}
          rows={(units.data ?? []).map((u) => [u.name, companyName.get(u.company_id) ?? "—"])}
          empty="Todavía no hay unidades de negocio."
        />
        {canStructure.data && (
          <ActionForm action={createBusinessUnit} submitLabel="Agregar unidad" className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Nombre" name="name" required />
            <SelectField label="Empresa" name="company_id" options={companyOptions} required />
          </ActionForm>
        )}
      </Section>

      <Section title="Oficinas">
        <Table
          headers={["Oficina", "Empresa", "Unidad", "País", "Zona horaria"]}
          rows={(offices.data ?? []).map((o) => [
            o.name,
            companyName.get(o.company_id) ?? "—",
            o.business_unit_id ? unitName.get(o.business_unit_id) ?? "—" : "—",
            o.country_code,
            o.timezone,
          ])}
          empty="Todavía no hay oficinas."
        />
        {canStructure.data && (
          <ActionForm action={createOffice} submitLabel="Agregar oficina" className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Nombre" name="name" required />
            <SelectField label="Empresa" name="company_id" options={companyOptions} required />
            <SelectField
              label="Unidad (opcional)"
              name="business_unit_id"
              options={[{ value: "", label: "Sin unidad" }, ...(units.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
            />
            <Field label="País" name="country_code" placeholder="MX" maxLength={2} required />
            <Field label="Zona horaria" name="timezone" defaultValue="America/Mexico_City" required />
          </ActionForm>
        )}
      </Section>

      <Section title="Usuarios">
        <Table
          headers={["Nombre", "Correo", "Roles", "Estado"]}
          rows={(profiles.data ?? []).map((p) => [
            <Link key={p.id} href={`/administracion/usuarios/${p.id}`} className="underline">{p.full_name || "—"}</Link>,
            p.email,
            (profileRoles.data ?? []).filter((pr) => pr.profile_id === p.id).map((pr) => roleName.get(pr.role_id)).join(", ") || "—",
            p.status === "active" ? "Activo" : "Inactivo",
          ])}
          empty="Todavía no hay usuarios."
        />
        {canUsers.data && (
          <>
            <h3 className="text-sm font-semibold">Invitaciones</h3>
            <Table
              headers={["Correo", "Rol", "Estado"]}
              rows={(invitations.data ?? []).map((i) => [i.email, roleName.get(i.role_id) ?? "—", i.accepted_at ? "Aceptada" : "Pendiente"])}
              empty="No hay invitaciones."
            />
            <ActionForm action={createInvitation} submitLabel="Invitar" className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label="Correo" name="email" type="email" required />
              <SelectField label="Rol" name="role_id" options={roleOptions} required />
            </ActionForm>
          </>
        )}
      </Section>
    </div>
  );
}
