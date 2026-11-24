"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createInstitution } from "./actions";
import { InstitutionFields } from "./institution-fields";
import { institutionTypes } from "./labels";
import { lookupInstitution } from "./lookup-action";
import type { Candidate } from "./lookup-parse";

type Option = { value: string; label: string };

// Alta de institución con búsqueda previa: el usuario elige una coincidencia y revisa la ficha prellenada antes de guardar.
export function NewInstitutionForm({ options, aiEnabled }: { options: { offices: Option[]; owners: Option[]; parents: Option[] }; aiEnabled: boolean }) {
  const [state, search, pending] = useActionState(lookupInstitution, null);
  const [picked, setPicked] = useState<{ n: number; c: Candidate } | null>(null);

  const values = picked ? {
    ...picked.c,
    source: "Sitio web",
    notes: [picked.c.notes, picked.c.source_url ? `Fuente: ${picked.c.source_url}` : null].filter(Boolean).join("\n"),
  } : {};

  return (
    <div className="space-y-6">
      <section aria-labelledby="buscar" className="space-y-3 rounded-xl border border-border border-l-4 border-l-primary bg-background p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-teal-700"><Globe aria-hidden className="size-5" /></span>
          <div>
            <h2 id="buscar" className="font-semibold">Ahórrate la captura</h2>
            <p className="text-sm text-muted-foreground">
              {aiEnabled ? "Escribe su nombre o sitio web: buscamos sus datos en internet y llenamos el formulario para que solo lo revises." : "Escribe su sitio web: leemos los datos publicados y llenamos el formulario para que solo lo revises."}
            </p>
          </div>
        </div>
        <form action={search} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">Buscar datos de la institución</span>
            <input name="q" defaultValue={state?.query} required minLength={3} maxLength={200}
              placeholder={aiEnabled ? "Nombre o sitio web, p. ej. Colegio Americano de Puebla" : "Sitio web, p. ej. colegio.edu.mx"}
              className="h-9 rounded-md border border-border bg-background px-3 shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
          </label>
          <Button type="submit" disabled={pending}>{pending ? "Buscando…" : "Buscar datos"}</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {aiEnabled ? "Revisa los datos antes de guardar." : "¿No tiene sitio web? Llena el formulario de abajo directamente. Para buscar por nombre, el administrador debe configurar la IA."}
        </p>
        <div role="status" aria-live="polite">
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          {state?.candidates && (
            <>
              <p className="text-sm">{state.candidates.length === 1 ? "Encontramos esta institución:" : `Encontramos ${state.candidates.length} coincidencias. Elige la correcta:`}</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {state.candidates.map((c, i) => (
                  <li key={`${c.name}-${i}`} className={`rounded-lg border p-3 text-sm ${picked?.c === c ? "border-primary" : "border-border"}`}>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-muted-foreground">
                      {[c.institution_type ? institutionTypes[c.institution_type] : null, c.city, c.region, c.country_code].filter(Boolean).join(" · ")}
                    </p>
                    {c.website && <p className="truncate text-muted-foreground">{c.website}</p>}
                    {c.phone && <p className="text-muted-foreground">Tel. {c.phone}</p>}
                    <button type="button" onClick={() => setPicked({ n: (picked?.n ?? 0) + 1, c })}
                      className="mt-2 text-sm font-medium text-primary underline">
                      {picked?.c === c ? "Seleccionada" : "Usar estos datos"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* key: al elegir otra coincidencia el formulario se reinicia con los nuevos valores. */}
      <ActionForm key={picked?.n ?? 0} action={createInstitution} submitLabel="Crear institución">
        <InstitutionFields {...options} values={values} withContact />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm_duplicates" /> Crear aunque parezca duplicada
        </label>
      </ActionForm>
    </div>
  );
}
