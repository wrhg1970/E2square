// Reglas compartidas por cliente y servidor (deben coincidir con el bucket "documents").
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const documentCategories = {
  proposal: "Propuesta",
  contract: "Contrato",
  presentation: "Presentación",
  price_list: "Lista de precios",
  material: "Material",
  other: "Otro",
} as const;

export const ALLOWED_MIME = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

// Nombre seguro para la ruta en Storage: sin acentos, espacios ni caracteres raros; conserva la extensión.
export function safeFileName(name: string) {
  const clean = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || "archivo").slice(-120);
}

export function validateFile(file: { name: string; size: number; type: string }): string | null {
  if (!file.name || file.size === 0) return "Elige un archivo.";
  if (file.size > MAX_DOCUMENT_BYTES) return "El archivo pesa más de 15 MB.";
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) return "Tipo de archivo no permitido. Usa PDF, Word, Excel, PowerPoint, imagen o CSV.";
  return null;
}

export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
