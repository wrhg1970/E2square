import "server-only";
import readXlsx from "read-excel-file/node";
import { parseCsv } from "@/modules/institutions/import-parse";

// Primera hoja de un .xlsx (fechas como YYYY-MM-DD) o un .csv, como matriz de texto.
export async function readRows(file: File): Promise<string[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  const [sheet] = await readXlsx(buffer);
  return sheet.data.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
}
