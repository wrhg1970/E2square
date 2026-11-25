import "server-only";
import readXlsx from "read-excel-file/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsv } from "@/modules/institutions/import-parse";
import { googleClient } from "@/modules/google/api";
import { googleEnv } from "@/modules/google/config";
import { parseSheetUrl } from "./sheet-url";

const MAX_BYTES = 5 * 1024 * 1024;

// Primera hoja de un .xlsx (fechas como YYYY-MM-DD) o un .csv, como matriz de texto.
export async function readRows(file: File): Promise<string[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  const [sheet] = await readXlsx(buffer);
  return sheet.data.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
}

const noAccess =
  "No pude abrir la hoja. Conecta (o vuelve a conectar) tu cuenta de Google en Integraciones con una cuenta que pueda ver la hoja, o compártela como «Cualquier persona con el vínculo».";

// Lee una pestaña de Google Sheets: primero con la cuenta de Google del usuario; si no hay acceso, como hoja pública.
async function readSheet(url: string, supabase: SupabaseClient): Promise<{ rows: string[][]; name: string } | { error: string }> {
  const ref = parseSheetUrl(url);
  if (!ref) return { error: "La liga no es de Google Sheets. Cópiala desde la barra del navegador con la hoja abierta." };
  const env = googleEnv();
  if (env) {
    try {
      const g = await googleClient(env, supabase);
      if (g) {
        const tabs = await g.sheetTabs(ref.id);
        const tab = ref.gid === null ? tabs[0] : tabs.find((t) => String(t.sheetId) === ref.gid);
        if (!tab) return { error: "No encontré esa pestaña en la hoja. Abre la pestaña que quieres importar y copia la liga de nuevo." };
        return { rows: await g.sheetValues(ref.id, tab.title), name: `Google Sheets · ${tab.title}` };
      }
    } catch {
      // Sin permiso de Hojas de cálculo o sin acceso a esa hoja: se intenta como hoja pública.
    }
  }
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${ref.id}/export?format=csv${ref.gid === null ? "" : `&gid=${ref.gid}`}`, { cache: "no-store" });
    // Una hoja privada responde con la página de inicio de sesión (HTML), no con CSV.
    if (!res.ok || !res.headers.get("content-type")?.includes("text/csv")) return { error: noAccess };
    const text = await res.text();
    if (text.length > MAX_BYTES) return { error: "La hoja pesa más de 5 MB. Divídela en partes." };
    return { rows: parseCsv(text), name: "Google Sheets" };
  } catch {
    return { error: noAccess };
  }
}

// Filas a importar desde el archivo subido o la liga de Google Sheets del formulario.
export async function readImportInput(formData: FormData, supabase: SupabaseClient): Promise<{ rows: string[][]; name: string } | { error: string }> {
  const sheetUrl = String(formData.get("sheet_url") ?? "").trim();
  if (sheetUrl) {
    const res = await readSheet(sheetUrl, supabase);
    if ("error" in res) return res;
    // La API omite celdas vacías al final de cada fila: se rellenan para que las columnas no se corran.
    const width = Math.max(0, ...res.rows.map((r) => r.length));
    return { ...res, rows: res.rows.map((r) => [...r.map((c) => String(c ?? "")), ...Array(width - r.length).fill("")]) };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige un archivo .xlsx o .csv, o pega la liga de una hoja de Google Sheets." };
  if (!/\.(xlsx|csv)$/i.test(file.name)) return { error: "Formato no soportado. Usa .xlsx o .csv." };
  if (file.size > MAX_BYTES) return { error: "El archivo pesa más de 5 MB. Divídelo en partes." };
  try {
    return { rows: await readRows(file), name: file.name };
  } catch {
    return { error: "No se pudo leer el archivo. Revisa que sea un Excel (.xlsx) o CSV válido." };
  }
}
