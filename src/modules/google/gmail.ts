export type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
};

export type CommunicationRow = {
  external_id: string; thread_id: string | null; subject: string | null; snippet: string | null;
  from_email: string; to_emails: string[]; sent_at: string; direction: "inbound" | "outbound";
  contact_id: string; institution_id: string | null;
};

// "Ana <ana@x.mx>, b@y.mx" -> ["ana@x.mx", "b@y.mx"]
export function extractEmails(header: string | undefined): string[] {
  return [...(header ?? "").matchAll(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0].toLowerCase());
}

// Un registro por contacto del CRM que participa en el correo (sin contar al propio usuario).
export function matchMessage(
  msg: GmailMessage,
  me: string,
  contacts: Map<string, { contact_id: string; institution_id: string | null }>,
): CommunicationRow[] {
  const h = (name: string) => msg.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value;
  const from = extractEmails(h("from"))[0];
  if (!from) return [];
  const to = [...new Set([...extractEmails(h("to")), ...extractEmails(h("cc"))])];
  const participants = [...new Set([from, ...to])].filter((e) => e !== me.toLowerCase());
  const sent = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(h("date") ?? "");
  if (Number.isNaN(sent.getTime())) return [];
  return participants.flatMap((email) => {
    const c = contacts.get(email);
    return c ? [{
      external_id: msg.id, thread_id: msg.threadId ?? null, subject: h("subject")?.slice(0, 500) ?? null,
      snippet: msg.snippet?.slice(0, 500) ?? null, from_email: from, to_emails: to, sent_at: sent.toISOString(),
      direction: from === me.toLowerCase() ? "outbound" : "inbound", contact_id: c.contact_id, institution_id: c.institution_id,
    } satisfies CommunicationRow] : [];
  });
}

// Búsqueda incremental: desde la última sincronización (con 1 h de margen) o los últimos 30 días.
export function gmailQuery(lastSync: string | null, now = new Date()): string {
  if (!lastSync) return "newer_than:30d -in:chats";
  const after = Math.floor(Math.max(new Date(lastSync).getTime() - 3_600_000, now.getTime() - 30 * 86_400_000) / 1000);
  return `after:${after} -in:chats`;
}

// Correo de texto en formato RFC 2822 codificado base64url, como lo pide gmail.users.messages.send.
export function buildRawEmail(to: string, subject: string, body: string): string {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const mime = [
    `To: ${to.replace(/[\r\n]/g, "")}`,
    `Subject: =?UTF-8?B?${b64(subject.replace(/[\r\n]+/g, " "))}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(body.replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}
