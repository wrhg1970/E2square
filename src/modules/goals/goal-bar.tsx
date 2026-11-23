import { formatMoney } from "@/modules/opportunities/labels";
import { type goalMetrics, progressPct } from "./labels";

export type GoalProgress = {
  id: string; name: string; metric: keyof typeof goalMetrics; period_start: string; period_end: string; target: number;
  currency_code: string | null; owner_id: string | null; office_id: string | null; product_id: string | null;
  actual: number; unconverted: number; company_id?: string | null; business_unit_id?: string | null;
};

export const formatGoalValue = (v: number, currency: string | null) =>
  currency ? formatMoney(v, currency) : new Intl.NumberFormat("es-MX").format(Number(v));

export function GoalBar({ g }: { g: GoalProgress }) {
  const pct = progressPct(Number(g.actual), Number(g.target));
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-medium">{g.name}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatGoalValue(g.actual, g.currency_code)} de {formatGoalValue(g.target, g.currency_code)} · <strong className="text-foreground">{pct}%</strong>
        </span>
      </div>
      <div role="progressbar" aria-label={g.name} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {g.unconverted > 0 && (
        <p className="text-xs text-amber-700">{g.unconverted} venta(s) sin tipo de cambio a {g.currency_code}: no se suman. Agrega la tasa en Administración.</p>
      )}
    </div>
  );
}
