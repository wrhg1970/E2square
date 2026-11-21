"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { summarizeOpportunity, type BriefState } from "./actions";

// Se genera solo cuando el usuario lo pide (cada consulta tiene costo) y no se guarda.
export function BriefPanel({ opportunityId, enabled }: { opportunityId: string; enabled: boolean }) {
  const [state, run, pending] = useActionState<BriefState>(summarizeOpportunity.bind(null, opportunityId), {});
  return (
    <section aria-labelledby="ia-resumen" className="space-y-3 rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ia-resumen" className="flex items-center gap-2 font-semibold"><Sparkles className="size-4" aria-hidden />Resumen y riesgos (IA)</h2>
        {enabled ? (
          <form action={run}>
            <button type="submit" disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60">
              {pending ? "Generando…" : state.text ? "Volver a generar" : "Generar"}
            </button>
          </form>
        ) : (
          <span className="text-sm text-muted-foreground">Pendiente: el administrador debe configurar la IA.</span>
        )}
      </div>
      <div aria-live="polite">
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        {state.text && (
          <>
            <p className="whitespace-pre-wrap text-sm">{state.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Sugerencia generada con los datos de esta oportunidad que tú puedes ver. Verifícala antes de actuar; no cambia nada por sí sola.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
