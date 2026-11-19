// CRM interno: cada página depende de la sesión, así que se renderiza por request.
export const instant = false;

import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { signOut } from "@/modules/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("auth_user_id", auth.user.id).maybeSingle();

  // Cuenta válida pero sin invitación: no tiene organización ni datos visibles.
  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-sm">
          <h1 className="text-xl font-semibold">Sin acceso todavía</h1>
          <p className="text-muted-foreground">Tu cuenta no tiene una invitación activa. Pide a un administrador que te invite.</p>
          <form action={signOut}>
            <button type="submit" className="underline">Cerrar sesión</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <>
      <Sidebar userName={profile.full_name || profile.email} />
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </>
  );
}
