export const goalMetrics = {
  revenue: "Venta ganada",
  margin: "Margen ganado",
  units: "Unidades vendidas",
  new_institutions: "Instituciones nuevas",
  activities: "Actividades realizadas",
} as const;

export const moneyMetrics = ["revenue", "margin"] as const;

export const progressPct = (actual: number, target: number) => (target > 0 ? Math.round((actual / target) * 100) : 0);
