import type { ReactNode } from "react";
import { buttonVariants } from "./button";

// Formulario de alta cerrado detrás de un botón; al abrirse ocupa todo el ancho.
export function Reveal({ label, title, children, open, variant = "default" }: { label: string; title?: string; children: ReactNode; open?: boolean; variant?: "default" | "outline" }) {
  return (
    <details className="group w-full" open={open}>
      <summary className={`${buttonVariants({ variant })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">+ {label}</span>
        <span className="hidden group-open:inline">Cerrar</span>
      </summary>
      <div className="mt-3 rounded-xl border border-border bg-background p-5 shadow-sm">
        {title && <h2 className="mb-4 font-semibold">{title}</h2>}
        {children}
      </div>
    </details>
  );
}

// Bloque con título dentro de un formulario: los campos van en filas parejas.
export function FormBlock({ title, children, cols = 3 }: { title: string; children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</legend>
      <div className={`grid gap-3 ${grid} sm:items-end`}>{children}</div>
    </fieldset>
  );
}
