import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "./crypto";
import { GOOGLE_SCOPES, type GoogleEnv } from "./config";
import type { GmailMessage } from "./gmail";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function authUrl(env: GoogleEnv, redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(env: GoogleEnv, code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google rechazó el código (${res.status})`);
  const t = (await res.json()) as { refresh_token?: string; id_token?: string; scope: string };
  // El id_token llega directo de Google por TLS en este intercambio; solo leemos el correo.
  const claims = JSON.parse(Buffer.from(String(t.id_token).split(".")[1] ?? "", "base64url").toString()) as { email?: string; email_verified?: boolean };
  if (!t.refresh_token || !claims.email || !claims.email_verified) throw new Error("Google no devolvió una cuenta verificada");
  return { refreshToken: t.refresh_token, email: claims.email.toLowerCase(), scope: t.scope };
}

class GoogleError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Cliente con el token de acceso del usuario actual; null si no ha conectado su cuenta.
export async function googleClient(env: GoogleEnv, supabase: SupabaseClient) {
  const { data: conn } = await supabase.from("google_connections").select("id, google_email, refresh_token_enc, last_sync_at").maybeSingle();
  if (!conn) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(conn.refresh_token_enc, env.GOOGLE_TOKEN_KEY), grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new GoogleError(res.status, "Google rechazó la conexión. Vuelve a conectar tu cuenta.");
  const { access_token } = (await res.json()) as { access_token: string };
  const call = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json", ...init?.headers } });
    if (!r.ok) throw new GoogleError(r.status, `Google respondió ${r.status}`);
    return (await r.json()) as T;
  };
  return {
    conn,
    listMessageIds: (q: string) =>
      call<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q, maxResults: "100" })}`)
        .then((r) => (r.messages ?? []).map((m) => m.id)),
    getMessage: (id: string) =>
      call<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`),
    sendMessage: (raw: string) =>
      call<{ id: string; threadId: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) }),
    // Pestañas de una hoja: para encontrar el nombre de la pestaña a partir del gid de la liga.
    sheetTabs: (id: string) =>
      call<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(sheetId,title)`)
        .then((r) => (r.sheets ?? []).map((s) => s.properties)),
    // Valores tal como se ven en la hoja (fechas y números con su formato).
    sheetValues: (id: string, tab: string) =>
      call<{ values?: string[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}?valueRenderOption=FORMATTED_VALUE`)
        .then((r) => r.values ?? []),
    createEvent: (event: Record<string, unknown>) =>
      call<{ id: string; htmlLink: string }>("https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", body: JSON.stringify(event) }),
  };
}
