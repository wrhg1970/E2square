import type { ReactNode } from "react";

const tones = { default: "", alert: "text-red-700", warn: "text-amber-700", good: "text-teal-700" } as const;

// Cifra resumen para la fila de arriba de cada pantalla.
export function StatTile({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof tones }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-2xl font-extrabold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
