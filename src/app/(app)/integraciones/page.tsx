import { headers } from "next/headers";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/modules/activities/time";
import { disconnectGoogle, syncGmail } from "@/modules/google/actions";
import { googleEnv } from "@/modules/google/config";
import { aiEnv, DEFAULT_MODELS, providerLabel } from "@/modules/ai/config";
import { Field } from "@/components/ui/field";
import { createTemplate, deleteTemplate, removeWhatsappAccount, saveWhatsappAccount } from "@/modules/whatsapp/actions";
import { whatsappEnv } from "@/modules/whatsapp/config";

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
  const [{ data: meId }, { data: conn }, { data: waAccounts }, { data: canAdmin }, h, { data: waTemplates }] = await Promise.all([
    supabase.rpc("current_profile_id"),
    supabase.from("google_connections").select("google_email, connected_at, last_sync_at").maybeSingle(),
    supabase.from("whatsapp_accounts").select("id, display_phone, phone_number_id, last_event_at").order("created_at"),
    supabase.rpc("has_permission", { permission: "admin.structure" }),
    headers(),
    supabase.from("whatsapp_templates").select("id, name, language, body_preview").order("name"),
  ]);
  const webhookUrl = `https://${h.get("host")}/api/whatsapp/webhook`;
  const [{ data: me }, { data: mails }] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("id", meId).maybeSingle(),
    supabase.from("communications").select("id, channel, direction, subject, snippet, from_email, from_phone, sent_at, institution_id, contact_id")
      .eq("owner_id", meId).order("sent_at", { ascending: false }).limit(20),
  ]);
  const tz = me?.timezone ?? "America/Mexico_City";
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;

  const ai = aiEnv();

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

      <section className="space-y-2 rounded-xl border border-border bg-background shadow-sm p-5">
        <h2 className="font-semibold">Inteligencia artificial</h2>
        {ai ? (
          <p className="text-sm">Activa con {providerLabel[ai.AI_PROVIDER]} · modelo {ai.AI_MODEL ?? DEFAULT_MODELS[ai.AI_PROVIDER]}. Se usa en &ldquo;Resumen y riesgos&rdquo; de cada oportunidad, solo cuando alguien lo pide.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Pendiente: el administrador debe elegir Gemini o Claude y registrar su clave en el servidor (ver README, sección IA).</p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-5">
        <h2 className="font-semibold">WhatsApp Business (API oficial de Meta)</h2>
        <p className="text-sm text-muted-foreground">
          Los mensajes que tus contactos envíen al número de la empresa se registran en la ficha de su institución
          (se reconoce al contacto por los últimos 10 dígitos de su teléfono). Desde la ficha se envían mensajes: libres dentro de 24 h
          desde el último mensaje del contacto y, fuera de esa ventana, solo plantillas aprobadas a contactos que aceptaron recibir WhatsApp.
          Si un contacto responde BAJA o STOP queda como &ldquo;No contactar&rdquo;.
        </p>
        <p className="text-sm">
          Envío: {whatsappEnv() ? "activo." : <span className="text-muted-foreground">pendiente: el administrador debe registrar el token de Meta en el servidor (ver README, WhatsApp).</span>}
        </p>
        {(waAccounts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Pendiente: ningún número conectado.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(waAccounts ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{a.display_phone}</span> · {a.last_event_at ? `Último mensaje recibido: ${formatDateTime(a.last_event_at, tz)}` : "Aún no llegan mensajes"}
                </span>
                {canAdmin && (
                  <form action={removeWhatsappAccount.bind(null, a.id)}>
                    <button type="submit" className="text-sm text-red-700 underline">Quitar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canAdmin && (
          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Conectar o actualizar un número</summary>
            <p className="mt-2 text-sm text-muted-foreground">
              En Meta › WhatsApp › Configuration usa como Callback URL <code className="rounded bg-muted px-1">{webhookUrl}</code>,
              pega el token de verificación que aparece al guardar y suscribe el campo <code className="rounded bg-muted px-1">messages</code>.
            </p>
            <ActionForm action={saveWhatsappAccount} submitLabel="Guardar número" className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label="Phone number ID" name="phone_number_id" inputMode="numeric" required />
              <Field label="Número visible" name="display_phone" placeholder="+52 55 1234 5678" required />
              <Field label="App Secret" name="app_secret" type="password" autoComplete="off" required />
            </ActionForm>
          </details>
        )}
        <h3 className="text-sm font-semibold">Plantillas aprobadas</h3>
        {(waTemplates ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin plantillas. Créalas y apruébalas en WhatsApp Manager y luego regístralas aquí con el mismo nombre.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(waTemplates ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{t.name}</span> ({t.language}) · {t.body_preview}</span>
                {canAdmin && (
                  <form action={deleteTemplate.bind(null, t.id)}>
                    <button type="submit" className="text-sm text-red-700 underline">Quitar plantilla</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canAdmin && (
          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Registrar plantilla</summary>
            <ActionForm action={createTemplate} submitLabel="Agregar plantilla" className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
              <Field label="Nombre en Meta" name="name" placeholder="seguimiento_informes" required />
              <Field label="Idioma" name="language" defaultValue="es_MX" required />
              <Field label="Texto (para vista previa)" name="body_preview" placeholder="Hola {{1}}, ¿pudiste revisar la propuesta?" className="sm:col-span-2" required />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="uses_first_name" /> La variable {"{{1}}"} es el nombre del contacto
              </label>
            </ActionForm>
          </details>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Mis mensajes registrados</h2>
        {(mails ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay correos ni mensajes registrados.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {(mails ?? []).map((m) => (
              <li key={m.id} className="py-2">
                <p className="font-medium">
                  {m.channel === "whatsapp" ? `WhatsApp: ${m.snippet ?? ""}` : `${m.direction === "outbound" ? "Enviado" : "Recibido"}: ${m.subject || "(sin asunto)"}`}
                </p>
                <p className="text-muted-foreground">
                  {formatDateTime(m.sent_at, tz)} · {m.from_email ?? m.from_phone}
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
