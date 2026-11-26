"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { leadStatuses, leadStatusTone, type LeadStatus } from "./labels";
import { pillTones } from "@/components/ui/pill";

// Estatus de un clic: cada botón guarda su estatus; el actual queda marcado.
export function StatusButtons({ action, current }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; current: LeadStatus }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
      className="space-y-1.5"
    >
      <fieldset disabled={pending} className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Cambiar estatus</legend>
        {(Object.keys(leadStatuses) as LeadStatus[]).map((s) => (
          <button key={s} type="submit" name="status" value={s} aria-pressed={s === current}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-60 ${s === current ? pillTones[leadStatusTone[s]] + " font-semibold" : "bg-background text-muted-foreground ring-border hover:text-foreground"}`}>
            {leadStatuses[s]}
          </button>
        ))}
      </fieldset>
      <p role="status" aria-live="polite" className="text-xs">
        {state?.error && <span className="text-red-700">{state.error}</span>}
        {state?.success && <span className="text-green-700">{state.success}</span>}
      </p>
    </form>
  );
}
