type Json = Record<string, unknown> | null;

// Campos técnicos que cambian en cada escritura y no aportan a la auditoría.
const NOISE = new Set(["updated_at", "created_at", "organization_id", "search_vector"]);

export const auditTables: Record<string, string> = {
  institutions: "Instituciones",
  contacts: "Contactos",
  opportunities: "Oportunidades",
  opportunity_items: "Líneas de oportunidad",
  products: "Productos",
  price_list_items: "Lista de precios",
  pipeline_stages: "Etapas",
  goals: "Metas",
  exchange_rates: "Tipos de cambio",
  commissions: "Comisiones",
  commission_rates: "Porcentajes de comisión",
  automation_rules: "Automatizaciones",
  activities: "Actividades",
  google_connections: "Conexiones de Google",
  documents: "Documentos",
  profiles: "Usuarios",
  profile_roles: "Roles de usuario",
  user_scopes: "Ámbitos",
  role_permissions: "Permisos",
  organizations: "Organización",
  whatsapp_accounts: "Números de WhatsApp",
  whatsapp_templates: "Plantillas de WhatsApp",
  "export:oportunidades": "Exportación de oportunidades",
  "export:bitacora": "Exportación de bitácora",
  "export:comisiones": "Exportación de comisiones",
};

// Auditoría financiera: todo lo que mueve montos, precios, márgenes, tipos de cambio o comisiones.
export const FINANCE_TABLES = ["opportunities", "opportunity_items", "price_list_items", "exchange_rates", "commissions", "commission_rates"];
export const FINANCE_FILTER = "finanzas";

export const actionLabels: Record<string, string> = { INSERT: "Alta", UPDATE: "Cambio", DELETE: "Baja" };

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

// Lista "campo: antes → después" de lo que cambió; en altas/bajas, los valores presentes.
export function changes(oldData: Json, newData: Json): string[] {
  if (oldData && newData) {
    return Object.keys(newData)
      .filter((k) => !NOISE.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
      .map((k) => `${k}: ${show(oldData[k])} → ${show(newData[k])}`);
  }
  const row = newData ?? oldData ?? {};
  return Object.keys(row)
    .filter((k) => !NOISE.has(k) && k !== "id" && row[k] !== null && row[k] !== "")
    .map((k) => `${k}: ${show(row[k])}`);
}
