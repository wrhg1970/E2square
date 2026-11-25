"use client";

import { useActionState, useState } from "react";
import { Copy, ExternalLink, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";
import { sendEmail } from "./actions";
import { gmailComposeUrl } from "./templates";

// Correo ya llenado y editable: se abre en Gmail o se copia; si Gmail está conectado, también se envía desde aquí.
export function ComposeForm({ to: to0, subject: subject0, body: body0, institutionId, contactId, templateId, canSend }: {
  to: string; subject: string; body: string; institutionId?: string; contactId?: string; templateId?: string; canSend: boolean;
}) {
  const [to, setTo] = useState(to0);
  const [subject, setSubject] = useState(subject0);
  const [body, setBody] = useState(body0);
  const [copied, setCopied] = useState("");
  const [state, action, pending] = useActionState(sendEmail, null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Asunto: ${subject}\n\n${body}`);
      setCopied("Copiado. Pégalo en tu correo.");
    } catch {
      setCopied("No se pudo copiar; selecciona el texto y cópialo a mano.");
    }
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="institution_id" value={institutionId ?? ""} />
      <input type="hidden" name="contact_id" value={contactId ?? ""} />
      <input type="hidden" name="template_id" value={templateId ?? ""} />
      <Field label="Para" name="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="correo@colegio.edu.mx" required />
      <Field label="Asunto" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <TextareaField label="Mensaje" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} required />
      <div className="flex flex-wrap items-center gap-2">
        <a href={gmailComposeUrl(to, subject, body)} target="_blank" rel="noopener noreferrer"
          className={buttonVariants({ variant: canSend ? "outline" : "default" })}>
          <ExternalLink className="size-4" aria-hidden />Abrir en Gmail
        </a>
        <Button type="button" variant="outline" onClick={copy}><Copy className="size-4" aria-hidden />Copiar texto</Button>
        {canSend && <Button type="submit" disabled={pending}><Send className="size-4" aria-hidden />{pending ? "Enviando…" : "Enviar desde mi Gmail"}</Button>}
        <p role="status" aria-live="polite" className="text-sm">
          {state?.error && <span className="text-red-700">{state.error}</span>}
          {state?.success && <span className="text-green-700">{state.success}</span>}
          {!state && copied && <span className="text-green-700">{copied}</span>}
        </p>
      </div>
    </form>
  );
}
