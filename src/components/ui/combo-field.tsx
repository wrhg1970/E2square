"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

// Lista larga con buscador: se escribe para filtrar y se elige; el formulario recibe el id en `name`.
export function ComboField({ label, name, options, defaultValue = "", required, placeholder = "Escribe para buscar", className }: {
  label: string; name: string; options: Option[]; defaultValue?: string; required?: boolean; placeholder?: string; className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(options.find((o) => o.value === defaultValue)?.label ?? "");
  const match = options.find((o) => o.label === text);
  return (
    <label className={cn("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium">{label}</span>
      <input
        list={id} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} required={required} autoComplete="off"
        // Sin coincidencia exacta el navegador avisa antes de enviar.
        pattern={options.map((o) => o.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || undefined}
        title="Elige una opción de la lista"
        className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <datalist id={id}>{options.map((o) => <option key={o.value} value={o.label} />)}</datalist>
      <input type="hidden" name={name} value={match?.value ?? ""} />
    </label>
  );
}
