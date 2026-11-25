"use client";

import { useActionState } from "react";
import { changeStage } from "./actions";

type Stage = { id: string; name: string; is_won: boolean; is_lost: boolean; missing: string[] };

// Barra de etapas clicable: mover es un clic; los requisitos solo se muestran cuando faltan.
export function StageBar({ opportunityId, stageId, stages, canMove }: { opportunityId: string; stageId: string; stages: Stage[]; canMove: boolean }) {
  const [state, action, pending] = useActionState(changeStage.bind(null, opportunityId), null);
  const current = stages.findIndex((s) => s.id === stageId);
  // La siguiente etapa que pide algo que aún falta (los requisitos se acumulan hacia adelante).
  const next = stages.find((s, i) => i > current && !s.is_lost && s.missing.length > 0);
  const step = (s: Stage, i: number) => {
    const here = s.id === stageId;
    const tone = here
      ? s.is_lost ? "bg-red-600 text-white" : "bg-primary text-primary-foreground font-semibold"
      : done(i, current, stages) ? "bg-primary/15 text-teal-900" : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground";
    return `flex min-h-9 w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors ${tone} disabled:cursor-default`;
  };

  return (
    <form action={action} aria-label="Etapa de la oportunidad" className="space-y-2">
      <ol className="grid grid-cols-2 gap-1.5 sm:flex">
        {stages.map((s, i) => (
          <li key={s.id} className="sm:flex-1">
            {s.is_lost && s.id !== stageId && canMove ? (
              <details className="group relative">
                <summary className={`${step(s, i)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{s.name}</summary>
                <div className="absolute right-0 z-10 mt-1 w-64 space-y-2 rounded-lg border border-border bg-background p-3 shadow-lg">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Motivo de pérdida</span>
                    <input name="loss_reason" maxLength={300} placeholder="Precio, eligió a otro, sin presupuesto…" className="h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
                  </label>
                  <button type="submit" name="stage_id" value={s.id} disabled={pending} className="h-8 w-full rounded-md bg-red-600 text-sm font-medium text-white hover:bg-red-700">Marcar como perdida</button>
                </div>
              </details>
            ) : (
              <button
                type="submit" name="stage_id" value={s.id}
                disabled={!canMove || s.id === stageId || pending}
                aria-current={s.id === stageId ? "step" : undefined}
                title={s.missing.length ? `Falta: ${s.missing.join(", ")}` : undefined}
                className={step(s, i)}
              >
                {done(i, current, stages) && <span aria-hidden>✓</span>}{s.name}
              </button>
            )}
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite" className="text-xs">
        {pending ? <span className="text-muted-foreground">Moviendo…</span>
          : state?.error ? <span className="text-red-700">{state.error}</span>
          : state?.success ? <span className="text-green-700">{state.success}</span>
          : canMove && next ? <span className="text-amber-800">Para pasar a {next.name} falta: {next.missing.join(", ").toLowerCase()}.</span>
          : null}
      </p>
    </form>
  );
}

const done = (i: number, current: number, stages: Stage[]) => i < current && !stages[current]?.is_lost;
