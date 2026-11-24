// Ventas de un proveedor a partir de las oportunidades de su pipeline (las que el usuario puede ver).
export type SaleRow = {
  status: string;
  amount: number | string;
  currency_code: string;
  probability: number;
  closed_at: string | null;
  updated_at: string;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Fecha de la venta: cierre; si falta (datos importados), la última actualización.
const saleDate = (r: SaleRow) => new Date(r.closed_at ?? r.updated_at);

export function supplierSales<T extends SaleRow>(rows: T[], currency: string, now = new Date()) {
  const won = rows.filter((r) => r.status === "won");
  const open = rows.filter((r) => r.status === "open");
  const year = now.getUTCFullYear();
  const wonYear = won.filter((r) => saleDate(r).getUTCFullYear() === year);
  // Últimos 12 meses en la moneda del proveedor; otras monedas no se mezclan sin tipo de cambio.
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, now.getUTCMonth() - 11 + i, 1));
    const value = won
      .filter((r) => r.currency_code === currency)
      .filter((r) => { const s = saleDate(r); return s.getUTCFullYear() === d.getUTCFullYear() && s.getUTCMonth() === d.getUTCMonth(); })
      .reduce((a, r) => a + Number(r.amount), 0);
    return { key: d.toISOString().slice(0, 7), name: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, value };
  });
  return {
    won,
    open,
    wonYear,
    otherCurrency: won.some((r) => r.currency_code !== currency),
    monthly,
    winRate: won.length + rows.filter((r) => r.status === "lost").length
      ? Math.round((won.length / (won.length + rows.filter((r) => r.status === "lost").length)) * 100)
      : null,
  };
}
