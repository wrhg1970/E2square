import Link from "next/link";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { COLUMNS } from "@/modules/institutions/import-parse";
import { importInstitutions } from "@/modules/institutions/import-action";
import { ImportForm } from "@/modules/institutions/import-form";

const REQUIRED = ["nombre", "tipo", "pais"];

export default function ImportPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="on-band page-header space-y-1">
        <Link href="/instituciones" className="text-sm text-muted-foreground underline">Instituciones</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Importar instituciones</h1>
      </div>

      <ol className="grid gap-3 text-sm sm:grid-cols-3" aria-label="Cómo funciona">
        {[
          ["Prepara tu Excel", "Usa la plantilla o tu propio archivo con encabezados parecidos."],
          ["Revisa", "Te decimos qué filas están listas y qué corregir. No se guarda nada."],
          ["Importa", "Con un clic se crean las listas. Los duplicados nunca se sobrescriben."],
        ].map(([title, text], i) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border bg-background p-4 shadow-sm">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
            <span><span className="block font-semibold">{title}</span><span className="text-muted-foreground">{text}</span></span>
          </li>
        ))}
      </ol>

      <section aria-labelledby="preparar" className="rounded-xl border border-border bg-background p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="preparar" className="font-semibold">Prepara tu archivo</h2>
            <p className="mt-1 text-sm text-muted-foreground">Una fila por institución. Puedes incluir un contacto por fila (opcional).</p>
          </div>
          <a href="/instituciones/importar/plantilla" download className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden className="size-4" /> Descargar plantilla
          </a>
        </div>
        <p className="mt-4 text-sm font-medium">Columnas obligatorias</p>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {REQUIRED.map((c) => <li key={c} className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-teal-800 ring-1 ring-inset ring-primary/30">{c}</li>)}
          <li className="self-center text-muted-foreground">(país con código de 2 letras, p. ej. MX, CO)</li>
        </ul>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Ver todas las columnas que reconocemos</summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {Object.keys(COLUMNS).filter((c) => !REQUIRED.includes(c)).map((c) => <li key={c} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{c}</li>)}
          </ul>
        </details>
      </section>

      <ImportForm action={importInstitutions} noun="instituciones" />
    </div>
  );
}
