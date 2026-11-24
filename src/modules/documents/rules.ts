// Reglas compartidas por cliente y servidor (deben coincidir con el bucket "documents").
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const documentCategories = {
  contract: "Contratos y convenios",
  proposal: "Propuestas comerciales",
  accreditation: "Acreditaciones y licencias",
  legal: "Legal y fiscal",
  presentation: "Presentaciones",
  price_list: "Listas de precios",
  material: "Materiales",
  other: "Otros",
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

// Vigencia: días que faltan (negativo = vencido). "soon" = vence en 30 días o menos.
export const SOON_DAYS = 30;
export type Validity = { kind: "none" } | { kind: "valid" | "soon" | "expired"; days: number };
export const validityFilters = { vigentes: "Vigentes", por_vencer: "Por vencer", vencidos: "Vencidos", sin_vigencia: "Sin vigencia" } as const;
const kindOfFilter = { vigentes: "valid", por_vencer: "soon", vencidos: "expired", sin_vigencia: "none" } as const;

export function validityOf(expiresOn: string | null | undefined, today: string): Validity {
  if (!expiresOn) return { kind: "none" };
  const days = Math.round((Date.parse(expiresOn) - Date.parse(today)) / 86_400_000);
  return { kind: days < 0 ? "expired" : days <= SOON_DAYS ? "soon" : "valid", days };
}

export const matchesValidity = (v: Validity, filter: keyof typeof validityFilters) => v.kind === kindOfFilter[filter];

export function validityLabel(v: Validity): string {
  if (v.kind === "none") return "Sin vigencia";
  if (v.kind === "expired") return v.days === -1 ? "Vencido ayer" : `Vencido hace ${-v.days} días`;
  if (v.days === 0) return "Vence hoy";
  if (v.kind === "soon") return v.days === 1 ? "Vence mañana" : `Vence en ${v.days} días`;
  return "Vigente";
}
