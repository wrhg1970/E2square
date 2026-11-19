import { TEMPLATE_HEADERS } from "@/modules/institutions/import-parse";

const EXAMPLE = ["Colegio Ejemplo", "Colegio Ejemplo SC", "Colegio", "MX", "Puebla", "Puebla", "", "colegioejemplo.mx", "222 123 4567", "", "", "800", "Feria", "Prospecto", "Alto", "Ana", "Pérez", "ana@colegioejemplo.mx", "", "Directora", "Decisor"];

// Plantilla CSV con BOM para que Excel respete los acentos.
export function GET() {
  const body = "﻿" + [TEMPLATE_HEADERS, EXAMPLE].map((r) => r.join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="plantilla-instituciones.csv"',
    },
  });
}
