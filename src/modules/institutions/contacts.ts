import "server-only";
import { dbErrorMessage } from "@/lib/action-state";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Reutiliza el contacto si el correo ya existe y es visible; si no, lo crea. Luego lo vincula a la institución.
export async function linkContact(
  supabase: Supabase,
  orgId: string,
  profileId: string,
  institutionId: string,
  person: { first_name: string; last_name: string; email?: string | null; phone?: string | null },
  link: { job_title?: string | null; department?: string | null; decision_role?: string | null; is_primary: boolean },
): Promise<{ error?: string; reused?: boolean }> {
  let contactId: string | undefined;
  let reused = false;
  if (person.email) {
    const { data } = await supabase.from("contacts").select("id").eq("email", person.email).maybeSingle();
    contactId = data?.id;
    reused = Boolean(contactId);
  }
  if (!contactId) {
    const { data, error } = await supabase
      .from("contacts")
      .insert({ ...person, organization_id: orgId, created_by: profileId })
      .select("id")
      .single();
    if (error?.code === "23505") return { error: "Ese correo pertenece a un contacto de otra cartera. Pide acceso a su responsable." };
    if (error) return { error: dbErrorMessage(error) };
    contactId = data.id;
  }
  if (link.is_primary) {
    await supabase.from("institution_contacts").update({ is_primary: false }).eq("institution_id", institutionId);
  }
  const { error } = await supabase
    .from("institution_contacts")
    .insert({ organization_id: orgId, institution_id: institutionId, contact_id: contactId, ...link });
  if (error?.code === "23505") return { error: "Ese contacto ya está vinculado a esta institución." };
  if (error) return { error: dbErrorMessage(error) };
  return { reused };
}
