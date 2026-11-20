"use client";

import { useActionState, useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
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
      <section className="space-y-3 rounded-xl border border-border bg-background shadow-sm p-4">
        <form action={search} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
            <span className="font-medium">Buscar datos de la institución</span>
            <input name="q" defaultValue={state?.query} required minLength={3} maxLength={200}
              placeholder={aiEnabled ? "Nombre o sitio web, p. ej. Colegio Americano de Puebla" : "Sitio web, p. ej. colegio.edu.mx"}
              className="h-9 rounded-md border border-border bg-background px-3" />
          </label>
          <Button type="submit" disabled={pending}>{pending ? "Buscando…" : "Buscar"}</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          {aiEnabled ? "Busca en internet y en el sitio de la institución. Revisa los datos antes de guardar." : "Lee los datos publicados en el sitio web. Para buscar por nombre, el administrador debe configurar la IA."}
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
