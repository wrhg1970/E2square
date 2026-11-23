"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "./import-action";

// Vista previa / importación de un Excel. "noun" es lo que se crea ("instituciones", "oportunidades").
export function ImportForm({ action: importAction, noun }: { action: (prev: ImportResult, formData: FormData) => Promise<ImportResult>; noun: string }) {
  const [state, action, pending] = useActionState<ImportResult, FormData>(importAction, null);
  const result = state && "mode" in state ? state : null;

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Archivo (.xlsx o .csv, máximo 5 MB)</span>
          <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">¿Qué hacer?</legend>
          <label className="flex items-center gap-2"><input type="radio" name="mode" value="preview" defaultChecked /> Solo vista previa (no guarda nada)</label>
          <label className="flex items-center gap-2"><input type="radio" name="mode" value="commit" /> Importar las filas listas</label>
        </fieldset>
        <Button type="submit" disabled={pending}>{pending ? "Procesando…" : "Continuar"}</Button>
        {state && "error" in state && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      </form>

      {result && (
        <div role="status" className="space-y-4 text-sm">
          <p className="font-medium">
            {result.fileName}: {result.total} filas · {result.ready.length} listas · {result.duplicates.length} posibles duplicados · {new Set(result.errors.map((e) => e.row)).size} con errores
          </p>
          {result.mode === "commit" ? (
            <p className="text-green-700">Se crearon {result.created} {noun}. Los duplicados y las filas con error no se importaron.</p>
          ) : (
            <p className="text-muted-foreground">Vista previa: no se guardó nada. Corrige el archivo o elige “Importar las filas listas”.</p>
          )}
          {result.unknownColumns.length > 0 && <p>Columnas ignoradas: {result.unknownColumns.join(", ")}</p>}
          {result.errors.length > 0 && (
            <details open>
              <summary className="cursor-pointer font-medium">Errores</summary>
              <table className="mt-2 w-full text-left">
                <thead className="text-muted-foreground"><tr><th className="pr-4">Fila</th><th className="pr-4">Campo</th><th>Problema y sugerencia</th></tr></thead>
                <tbody>
                  {result.errors.slice(0, 200).map((e, i) => (
                    <tr key={i} className="border-t border-border"><td className="pr-4">{e.row}</td><td className="pr-4">{e.field}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {result.duplicates.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Posibles duplicados (no se importan)</summary>
              <ul className="mt-2 list-disc pl-5">
                {result.duplicates.map((d) => <li key={d.row}>Fila {d.row}: {d.name} → ya existe {d.match}</li>)}
              </ul>
            </details>
          )}
          {result.ready.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Filas listas</summary>
              <ul className="mt-2 list-disc pl-5">
                {result.ready.slice(0, 200).map((r) => <li key={r.row}>Fila {r.row}: {r.label}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
