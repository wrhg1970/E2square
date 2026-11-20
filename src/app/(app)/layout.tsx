// CRM interno: cada página depende de la sesión, así que se renderiza por request.
export const instant = false;

import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { signOut } from "@/modules/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { addDays, dayIn, zonedToUtc } from "@/modules/activities/time";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("id, full_name, email, timezone").eq("auth_user_id", auth.user.id).maybeSingle();

  // Cuenta válida pero sin invitación: no tiene organización ni datos visibles.
  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-sm">
          <h1 className="text-xl font-semibold">Sin acceso todavía</h1>
          <p className="text-muted-foreground">Tu cuenta no tiene una invitación activa. Pide a un administrador que te invite.</p>
          <p className="text-muted-foreground">Entraste como <span className="font-medium text-foreground">{auth.user.email}</span>.</p>
          {profileError && (
            <p className="text-red-700">No se pudo leer tu perfil ({profileError.code}): {profileError.message}</p>
          )}
          <form action={signOut}>
            <button type="submit" className="underline">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  const endOfToday = zonedToUtc(`${addDays(dayIn(new Date(), profile.timezone), 1)}T00:00`, profile.timezone).toISOString();
  const { count: alerts } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", profile.id)
    .eq("status", "pending")
    .lt("due_at", endOfToday);

  return (
    <div className="flex min-h-full w-full flex-col md:flex-row">
      <Sidebar userName={profile.full_name || profile.email} alerts={alerts ?? 0} />
      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-10">{children}</main>
    </div>
  );
}
