"use client";

import { startTransition, useActionState, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "./import-action";

const card = "rounded-xl border border-border bg-background p-5 shadow-sm";

// Revisar e importar un Excel. "noun" es lo que se crea ("instituciones", "oportunidades").
// Primero se revisa (no guarda nada) y luego se importa el mismo archivo con un clic.
export function ImportForm({ action: importAction, noun }: { action: (prev: ImportResult, formData: FormData) => Promise<ImportResult>; noun: string }) {
  const [state, action, pending] = useActionState<ImportResult, FormData>(importAction, null);
  const [fileName, setFileName] = useState("");
  const result = state && "mode" in state ? state : null;
  const withErrors = result ? new Set(result.errors.map((e) => e.row)).size : 0;
  const canCommit = result?.mode === "preview" && result.ready.length > 0;

  return (
    <form
      // Sin esto React vacía el formulario tras cada envío y habría que volver a elegir el archivo para importar.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(data));
      }}
      className="space-y-4"
    >
      <section className={card} aria-labelledby="subir">
        <h2 id="subir" className="font-semibold">Sube tu archivo</h2>
        <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-canvas/60 px-4 py-8 text-center text-sm hover:border-primary focus-within:border-primary">
          {fileName ? <FileSpreadsheet aria-hidden className="size-7 text-teal-700" /> : <Upload aria-hidden className="size-7 text-muted-foreground" />}
          <span className="font-medium">{fileName || "Haz clic para elegir tu Excel"}</span>
          <span className="text-muted-foreground">{fileName ? "Haz clic para cambiarlo" : ".xlsx o .csv, máximo 5 MB"}</span>
          <input type="file" name="file" aria-label="Archivo de Excel" accept=".xlsx,.csv" required className="sr-only"
            onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? "")} />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" name="mode" value="preview" variant={canCommit ? "outline" : "default"} disabled={pending}>
            {pending ? "Procesando…" : result ? "Revisar de nuevo" : "Revisar archivo"}
          </Button>
          <span className="text-sm text-muted-foreground">La revisión no guarda nada: te dice qué filas están listas y cuáles hay que corregir.</span>
        </div>
        {state && "error" in state && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
      </section>

      {result && (
        <section role="status" aria-labelledby="resultado" className={`${card} space-y-4 text-sm`}>
          <h2 id="resultado" className="font-semibold">{result.mode === "commit" ? "Importación terminada" : "Resultado de la revisión"} · <span className="font-normal text-muted-foreground">{result.fileName}</span></h2>
          <p className="sr-only">
            {result.fileName}: {result.total} filas · {result.ready.length} listas · {result.duplicates.length} posibles duplicados · {withErrors} con errores
          </p>
          <dl aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Filas", result.total, "text-foreground"],
              ["Listas", result.ready.length, "text-teal-700"],
              ["Posibles duplicados", result.duplicates.length, "text-amber-700"],
              ["Con errores", withErrors, "text-red-700"],
            ].map(([label, n, tone]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={`text-2xl font-semibold tabular-nums ${tone}`}>{n}</dd>
              </div>
            ))}
          </dl>

          {result.mode === "commit" ? (
            <p className="flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-teal-900">
              <CheckCircle2 aria-hidden className="size-5 shrink-0" />
              Se crearon {result.created} {noun}. Los duplicados y las filas con error no se importaron.
            </p>
          ) : canCommit ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-teal-50 p-3">
              <Button type="submit" name="mode" value="commit" disabled={pending}>
                {pending ? "Importando…" : result.ready.length === 1 ? "Importar la fila lista" : `Importar las ${result.ready.length} filas listas`}
              </Button>
              <span className="text-teal-900">
                {result.duplicates.length || withErrors ? "Las filas duplicadas o con errores se omiten; puedes corregirlas y subirlas después." : "Todas las filas están listas."}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">Ninguna fila está lista todavía. Corrige el archivo con las indicaciones de abajo y vuelve a revisarlo.</p>
          )}

          {result.unknownColumns.length > 0 && <p className="text-muted-foreground">Columnas que no reconocimos y se ignoran: {result.unknownColumns.join(", ")}</p>}
          {result.errors.length > 0 && (
            <details open>
              <summary className="cursor-pointer font-medium">Qué corregir ({result.errors.length})</summary>
              <div className="table-card mt-2">
                <table className="w-full text-left">
                  <thead className="text-muted-foreground"><tr><th className="py-2 pr-4 font-medium">Fila</th><th className="py-2 pr-4 font-medium">Campo</th><th className="py-2 font-medium">Problema y sugerencia</th></tr></thead>
                  <tbody>
                    {result.errors.slice(0, 200).map((e, i) => (
                      <tr key={i} className="border-t border-border"><td className="py-2 pr-4">{e.row}</td><td className="py-2 pr-4">{e.field}</td><td className="py-2">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {result.duplicates.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Posibles duplicados, no se importan ({result.duplicates.length})</summary>
              <ul className="mt-2 list-disc pl-5">
                {result.duplicates.map((d) => <li key={d.row}>Fila {d.row}: {d.name} → ya existe {d.match}</li>)}
              </ul>
            </details>
          )}
          {result.ready.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">{result.mode === "commit" ? "Filas importadas" : "Filas listas"} ({result.ready.length})</summary>
              <ul className="mt-2 list-disc pl-5">
                {result.ready.slice(0, 200).map((r) => <li key={r.row}>Fila {r.row}: {r.label}</li>)}
              </ul>
            </details>
          )}
        </section>
      )}
    </form>
  );
}
