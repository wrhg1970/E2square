export const opportunityStatuses = { open: "Abierta", won: "Ganada", lost: "Perdida", cancelled: "Cancelada" } as const;

export const formatMoney = (amount: number | string | null, currency: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount ?? 0));

// Suma por moneda: no se mezclan monedas sin tipo de cambio (llega en Fase 5).
export function totalsByCurrency<T>(rows: T[], currency: (r: T) => string, value: (r: T) => number) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(currency(r), (totals.get(currency(r)) ?? 0) + value(r));
  return [...totals.entries()].map(([c, v]) => formatMoney(v, c)).join(" + ") || formatMoney(0, "USD");
}
