export const revenueModels = {
  direct: "Venta directa",
  commission: "Comisión",
  subscription: "Licencia / suscripción",
  mixed: "Mixto",
} as const;

// Requisitos que una etapa puede exigir para entrar en ella.
export const stageRequirements = {
  items: "Productos con monto",
  expected_close_date: "Fecha estimada de cierre",
  primary_contact: "Contacto principal",
  loss_reason: "Motivo de pérdida",
} as const;

export const CURRENCIES = ["USD", "MXN", "COP", "PEN", "CLP", "ARS", "EUR"] as const;
