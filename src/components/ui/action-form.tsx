"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { Button } from "./button";

export function ActionForm({
  action,
  submitLabel,
  children,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : submitLabel}
        </Button>
        <p role="status" aria-live="polite" className="text-sm">
          {state?.error && <span className="text-red-700">{state.error}</span>}
          {state?.success && <span className="text-green-700">{state.success}</span>}
        </p>
      </div>
      {state?.details && state.details.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {state.details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </form>
  );
}
