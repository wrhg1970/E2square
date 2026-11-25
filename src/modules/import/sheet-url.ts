// Saca el id de la hoja y la pestaña (gid) de una liga de Google Sheets.
// Acepta /edit, /view, ?gid=, #gid= y ligas de "Copiar vínculo". Sin gid se usa la primera pestaña.
export function parseSheetUrl(raw: string): { id: string; gid: string | null } | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const id = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(url.pathname)?.[1];
  if (!id) return null;
  const gid = url.searchParams.get("gid") ?? /(?:^|[#&])gid=(\d+)/.exec(url.hash)?.[1] ?? null;
  return { id, gid: gid && /^\d+$/.test(gid) ? gid : null };
}
