import Link from "next/link";
import { OPPORTUNITY_TEMPLATE } from "@/modules/opportunities/import-parse";
import { importOpportunities } from "@/modules/opportunities/import-action";
import { ImportForm } from "@/modules/institutions/import-form";

export default function ImportOpportunitiesPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="on-band page-header space-y-1">
        <Link href="/oportunidades" className="text-sm text-muted-foreground underline">Oportunidades</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Importar oportunidades</h1>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li><a href="/oportunidades/importar/plantilla" download className="underline">Descarga la plantilla</a> o usa tu Excel con encabezados parecidos.</li>
        <li>Obligatorias: <strong>institucion</strong> (ya importada), <strong>proveedor</strong> (nombre o código), <strong>monto</strong> y <strong>estado</strong> (Abierta, Ganada o Perdida). Las ganadas y perdidas llevan <strong>fecha_cierre</strong>.</li>
        <li><strong>responsable</strong> es el correo del usuario; si lo dejas vacío, quedan a tu nombre.</li>
        <li>Las ventas históricas conservan su fecha y cuentan en reportes y metas, pero <strong>no generan comisiones ni tareas automáticas</strong>.</li>
        <li>Haz una vista previa, corrige lo que marque y después importa. Los duplicados (misma institución, nombre y fecha) se omiten.</li>
      </ol>
      <details className="text-sm">
        <summary className="cursor-pointer">Columnas reconocidas</summary>
        <p className="mt-2 text-muted-foreground">{OPPORTUNITY_TEMPLATE.join(", ")}</p>
      </details>
      <ImportForm action={importOpportunities} noun="oportunidades" />
    </div>
  );
}
