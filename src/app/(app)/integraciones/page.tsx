import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/modules/activities/time";
import { disconnectGoogle, syncGmail } from "@/modules/google/actions";
import { googleEnv } from "@/modules/google/config";

const errors: Record<string, string> = {
  config: "La integración con Google aún no está configurada en el servidor.",
  estado: "La solicitud de conexión expiró o no es válida. Intenta de nuevo.",
  sesion: "Tu sesión expiró. Inicia sesión y vuelve a conectar.",
  guardar: "No se pudo guardar la conexión. Intenta de nuevo.",
  google: "Google no autorizó la conexión. Revisa que aceptaste todos los permisos.",
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/integraciones">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: meId }, { data: conn }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.from("google_connections").select("google_email, connected_at, last_sync_at").maybeSingle(),
  ]);
  const [{ data: me }, { data: mails }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle(),
    supabase.from("communications").select("id, direction, subject, from_email, sent_at, institution_id, contact_id")
      .eq("owner_id", meId).order("sent_at", { ascending: false }).limit(20),
  ]);
  const tz = me?.timezone ?? "America/Mexico_City";
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          Conecta tu cuenta de Google para registrar en el CRM los correos con tus contactos y mandar actividades a tu Google Calendar.
          Solo se guardan remitente, destinatarios, asunto, fecha y un extracto; nunca el cuerpo completo ni los adjuntos.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {sp.conectado && <p role="status" className="text-sm text-green-700">Cuenta de Google conectada.</p>}

      <section className="space-y-4 rounded-xl border border-border bg-background shadow-sm p-5">
        <h2 className="font-semibold">Google (Gmail y Calendar)</h2>
        {!googleEnv() ? (
          <p className="text-sm text-muted-foreground">Pendiente: el administrador debe registrar las credenciales de Google en el servidor.</p>
        ) : conn ? (
          <>
            <p className="text-sm">
              Conectada como <span className="font-medium">{conn.google_email}</span> desde {formatDateTime(conn.connected_at, tz)}.
              {" "}{conn.last_sync_at ? `Última sincronización: ${formatDateTime(conn.last_sync_at, tz)}.` : "Aún no se sincroniza."}
            </p>
            <div className="flex flex-wrap gap-6">
              <ActionForm action={syncGmail} submitLabel="Sincronizar correos">{null}</ActionForm>
              <ActionForm action={disconnectGoogle} submitLabel="Desconectar">{null}</ActionForm>
            </div>
          </>
        ) : (
          <a href="/api/google/connect" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Conectar mi cuenta de Google
          </a>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Mis correos registrados</h2>
        {(mails ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay correos registrados.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(mails ?? []).map((m) => (
              <li key={m.id} className="py-2">
                <p className="font-medium">{m.direction === "outbound" ? "Enviado" : "Recibido"}: {m.subject || "(sin asunto)"}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(m.sent_at, tz)} · {m.from_email}
                  {m.institution_id && <> · <Link href={`/instituciones/${m.institution_id}`} className="underline">Ver institución</Link></>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
