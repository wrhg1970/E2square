import Link from "next/link";
import { COLUMNS } from "@/modules/institutions/import-parse";
import { ImportForm } from "@/modules/institutions/import-form";

export default function ImportPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="on-band page-header space-y-1">
        <Link href="/instituciones" className="text-sm text-muted-foreground underline">Instituciones</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Importar instituciones</h1>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          <a href="/instituciones/importar/plantilla" download className="underline">Descarga la plantilla</a> o usa tu Excel con encabezados parecidos.</li>
        <li>Obligatorias: <strong>nombre</strong>, <strong>tipo</strong> y <strong>pais</strong> (código de 2 letras). Una fila por institución, con un contacto opcional.</li>
        <li>Haz una vista previa, corrige lo que marque y después importa. Los duplicados nunca se sobrescriben.</li>
      </ol>
      <details className="text-sm">
        <summary className="cursor-pointer">Columnas reconocidas</summary>
        <p className="mt-2 text-muted-foreground">{Object.keys(COLUMNS).join(", ")}</p>
      </details>
      <ImportForm />
    </div>
  );
}
