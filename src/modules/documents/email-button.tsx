"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { shareLink } from "./actions";

// Abre el correo del usuario con un enlace de descarga válido 7 días.
// shortcut: usa mailto; cuando exista el envío desde la sección Correos, mandar desde ahí.
export function EmailButton({ id, title, className }: { id: string; title: string; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button type="button" disabled={pending} aria-label={`Enviar por correo ${title}`} title={error || "Enviar por correo"} className={className}
        onClick={() => start(async () => {
          const r = await shareLink(id);
          if (!r.url) return setError(r.error ?? "No se pudo generar el enlace.");
          setError("");
          const body = `Hola:\n\nTe comparto «${title}». Puedes descargarlo aquí (el enlace vence en 7 días):\n${r.url}\n\nSaludos.`;
          window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
        })}>
        <Mail aria-hidden className="size-4" />
      </button>
      {error && <span role="alert" className="sr-only">{error}</span>}
    </>
  );
}
