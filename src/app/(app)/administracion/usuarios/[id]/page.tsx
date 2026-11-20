import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addUserScope, removeUserScope, setUserRole, setUserStatus } from "@/modules/admin/actions";

const scopeLabels = { organization: "Toda la organización", company: "Empresa", business_unit: "Unidad de negocio", office: "Oficina", territory: "Territorio" } as const;

export default async function UserPage({ params }: PageProps<"/administracion/usuarios/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: user }, { data: me }, canUsers, roles, myRoles, scopes, org, companies, units, offices, territories] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, status").eq("id", id).maybeSingle(),
    supabase.rpc("current_profile_id"),
    supabase.rpc("has_permission", { permission: "admin.users" }),
    supabase.from("roles").select("id, name").order("name"),
    supabase.from("profile_roles").select("role_id").eq("profile_id", id),
    supabase.from("user_scopes").select("id, scope_type, scope_id").eq("profile_id", id),
    supabase.from("organizations").select("id, name").maybeSingle(),
    supabase.from("companies").select("id, legal_name").order("legal_name"),
    supabase.from("business_units").select("id, name").order("name"),
    supabase.from("offices").select("id, name").order("name"),
    supabase.from("territories").select("id, name").order("name"),
  ]);
  if (!user) notFound();

  const targets = [
    ...(org.data ? [{ type: "organization", id: org.data.id, name: org.data.name }] : []),
    ...(companies.data ?? []).map((c) => ({ type: "company", id: c.id, name: c.legal_name })),
    ...(units.data ?? []).map((u) => ({ type: "business_unit", id: u.id, name: u.name })),
    ...(offices.data ?? []).map((o) => ({ type: "office", id: o.id, name: o.name })),
    ...(territories.data ?? []).map((t) => ({ type: "territory", id: t.id, name: t.name })),
  ] as { type: keyof typeof scopeLabels; id: string; name: string }[];
  const targetName = new Map(targets.map((t) => [`${t.type}:${t.id}`, `${scopeLabels[t.type]}: ${t.name}`]));
  const currentRole = myRoles.data?.[0]?.role_id ?? "";
  const isMe = me === user.id;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/administracion" className="text-sm underline">← Administración</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{user.full_name || user.email}</h1>
        <p className="text-sm text-muted-foreground">{user.email} · {user.status === "active" ? "Activo" : "Inactivo (no puede entrar)"}</p>
      </div>

      {!canUsers.data ? (
        <p className="text-sm text-muted-foreground">Solo quien administra usuarios puede cambiar roles, estado o ámbitos.</p>
      ) : (
        <>
          <section className="space-y-3 border-t border-border pt-6">
            <h2 className="text-lg font-semibold">Rol</h2>
            <p className="text-sm text-muted-foreground">El rol define qué puede hacer (crear, editar catálogo, metas, exportar…).</p>
            <ActionForm action={setUserRole.bind(null, user.id)} submitLabel="Guardar rol" className="flex flex-wrap items-end gap-3">
              <SelectField label="Rol" name="role_id" defaultValue={currentRole}
                options={[...(currentRole ? [] : [{ value: "", label: "Sin rol" }]), ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))]} />
            </ActionForm>
          </section>

          <section className="space-y-3 border-t border-border pt-6">
            <h2 className="text-lg font-semibold">Qué cartera ve</h2>
            <p className="text-sm text-muted-foreground">
              Además de sus propias instituciones, ve las de estos ámbitos. Sin ámbitos, un vendedor solo ve lo suyo.
            </p>
            {(scopes.data ?? []).length === 0 ? (
              <p className="text-sm">Solo su propia cartera.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {(scopes.data ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    {targetName.get(`${s.scope_type}:${s.scope_id}`) ?? scopeLabels[s.scope_type as keyof typeof scopeLabels]}
                    <form action={removeUserScope}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="profile_id" value={user.id} />
                      <button type="submit" className="text-xs underline">Quitar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={addUserScope.bind(null, user.id)} submitLabel="Agregar ámbito" className="flex flex-wrap items-end gap-3">
              <SelectField label="Ámbito" name="scope"
                options={[{ value: "", label: "Elige" }, ...targets.map((t) => ({ value: `${t.type}:${t.id}`, label: `${scopeLabels[t.type]}: ${t.name}` }))]} />
            </ActionForm>
          </section>

          <section className="space-y-3 border-t border-border pt-6">
            <h2 className="text-lg font-semibold">Acceso</h2>
            {isMe ? (
              <p className="text-sm text-muted-foreground">No puedes desactivar tu propio usuario.</p>
            ) : (
              <ActionForm action={setUserStatus.bind(null, user.id)} submitLabel={user.status === "active" ? "Desactivar usuario" : "Reactivar usuario"}>
                <input type="hidden" name="status" value={user.status === "active" ? "inactive" : "active"} />
                <p className="text-sm text-muted-foreground">
                  {user.status === "active" ? "Deja de poder entrar; su historial y su cartera se conservan." : "Vuelve a poder entrar con su mismo rol y ámbitos."}
                </p>
              </ActionForm>
            )}
          </section>
        </>
      )}
    </div>
  );
}
