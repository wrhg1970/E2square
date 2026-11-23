import { OPPORTUNITY_TEMPLATE } from "@/modules/opportunities/import-parse";

const EXAMPLE = ["Colegio Ejemplo", "", "PROVEEDOR", "", "$12,500.00", "", "MXN", "Ganada", "30/06/2025", "", ""];

// Plantilla CSV con BOM para que Excel respete los acentos.
export function GET() {
  const body = "﻿" + [OPPORTUNITY_TEMPLATE, EXAMPLE].map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="plantilla-oportunidades.csv"',
    },
  });
}
