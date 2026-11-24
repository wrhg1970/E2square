"use client";

import { useState } from "react";
import { SelectField } from "@/components/ui/field";
import { CURRENCIES } from "@/modules/catalog/labels";

type Inst = { id: string; label: string };
type Provider = { pipelineId: string; name: string; currency: string };

// Institución con buscador (escribir para filtrar cientos) y moneda que sigue al proveedor elegido.
export function OpportunityBasics({ institutions, providers, institutionId = "", pipelineId = "" }: {
  institutions: Inst[]; providers: Provider[]; institutionId?: string; pipelineId?: string;
}) {
  const initial = institutions.find((i) => i.id === institutionId);
  const [instText, setInstText] = useState(initial?.label ?? "");
  const match = institutions.find((i) => i.label === instText);
  const [currency, setCurrency] = useState(providers.find((p) => p.pipelineId === pipelineId)?.currency ?? "USD");

  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Institución</span>
        <input
          list="opportunity-institutions"
          value={instText}
          onChange={(e) => setInstText(e.target.value)}
          placeholder="Escribe para buscar…"
          autoComplete="off"
          required
          aria-describedby="institution-hint"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <span id="institution-hint" className={`text-xs ${instText && !match ? "text-amber-700" : "text-muted-foreground"}`}>
          {instText && !match ? "Elige una institución de la lista." : `${institutions.length} instituciones registradas.`}
        </span>
      </label>
      <datalist id="opportunity-institutions">{institutions.map((i) => <option key={i.id} value={i.label} />)}</datalist>
      {/* El servidor valida el id; si el texto no coincide va vacío y responde "Elige una institución". */}
      <input type="hidden" name="institution_id" value={match?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <SelectField
          label="Proveedor"
          name="pipeline_id"
          defaultValue={pipelineId}
          onChange={(e) => setCurrency(providers.find((p) => p.pipelineId === e.target.value)?.currency ?? currency)}
          options={[{ value: "", label: "Elige un proveedor" }, ...providers.map((p) => ({ value: p.pipelineId, label: p.name }))]}
          required
        />
        <SelectField label="Moneda" name="currency_code" value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </div>
    </>
  );
}
