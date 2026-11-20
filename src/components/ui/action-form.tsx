"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { Button } from "./button";

export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  submitVariant,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  submitVariant?: "default" | "outline";
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  // React limpia el formulario tras cada envío; así solo se limpia si salió bien y no se pierde lo capturado ante un error.
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  return (
    <form
      ref={ref}
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
      className={className ?? "flex flex-col gap-3"}
    >
      {children}
      <div className="flex items-center gap-3">
        <Button type="submit" variant={submitVariant} disabled={pending}>
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
