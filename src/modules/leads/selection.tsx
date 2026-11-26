"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { leadStatuses, type LeadStatus } from "./labels";

export const BULK_FORM = "prospectos-seleccion";
const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${BULK_FORM}"]`)];

// Casilla de cada fila; pertenece al formulario de la barra aunque esté dentro de la tabla.
export function RowCheck({ id, name }: { id: string; name: string }) {
  return <input type="checkbox" name="ids" value={id} form={BULK_FORM} aria-label={`Seleccionar a ${name}`} className="size-4 rounded border-border accent-[var(--primary)]" />;
}

// Casilla del encabezado: marca o desmarca todas las filas visibles.
export function SelectAll() {
  return (
    <input type="checkbox" aria-label="Seleccionar todos los visibles" className="size-4 rounded border-border"
      onChange={(e) => { for (const b of boxes()) b.checked = e.currentTarget.checked; document.getElementById(BULK_FORM)?.dispatchEvent(new Event("change", { bubbles: true })); }} />
  );
}

// Barra de acciones en grupo: cambiar estatus, archivar (o sacar del archivo) y borrar con confirmación.
export function BulkBar({ action, archived }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; archived: boolean }) {
  const [count, setCount] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await action(prev, data);
    if (result?.success) { for (const b of boxes()) b.checked = false; setCount(0); setConfirming(false); }
    return result;
  }, null);
  useEffect(() => {
    const sync = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  const none = count === 0 || pending;
  return (
    <form id={BULK_FORM} action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
      className={`sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-sm transition-colors ${count ? "border-band bg-band text-white" : "border-border bg-background text-muted-foreground"}`}>
      <span data-bulk-count className="min-w-36 font-semibold">{count ? `${count} seleccionado${count === 1 ? "" : "s"}` : "Selecciona prospectos"}</span>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Nuevo estatus</span>
        <select name="status" disabled={none} defaultValue="" className="h-8 rounded-md border border-border bg-background px-2 text-foreground disabled:opacity-50">
          <option value="" disabled>Cambiar estatus a…</option>
          {(Object.keys(leadStatuses) as LeadStatus[]).map((s) => <option key={s} value={s}>{leadStatuses[s]}</option>)}
        </select>
      </label>
      <Button type="submit" name="op" value="status" size="sm" variant="outline" disabled={none} className="text-foreground">Aplicar</Button>
      {archived
        ? <Button type="submit" name="op" value="unarchive" size="sm" variant="outline" disabled={none} className="text-foreground"><ArchiveRestore aria-hidden className="size-4" /> Sacar del archivo</Button>
        : <Button type="submit" name="op" value="archive" size="sm" variant="outline" disabled={none} className="text-foreground"><Archive aria-hidden className="size-4" /> Archivar</Button>}
      {confirming && count ? (
        <span className="flex items-center gap-2">
          <span>¿Borrar {count} para siempre?</span>
          <Button type="submit" name="op" value="delete" size="sm" disabled={pending} className="bg-red-600 text-white hover:bg-red-700">Sí, borrar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
        </span>
      ) : (
        <Button type="button" size="sm" variant="outline" disabled={none} onClick={() => setConfirming(true)} className="text-red-700"><Trash2 aria-hidden className="size-4" /> Borrar</Button>
      )}
      <p role="status" aria-live="polite" className="ml-auto text-sm">
        {state?.error && <span className="font-medium text-red-300">{state.error}</span>}
        {state?.success && <span>{state.success}</span>}
      </p>
    </form>
  );
}
