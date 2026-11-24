import type { ReactNode } from "react";

export const pillTones = {
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  sky: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;
export type PillTone = keyof typeof pillTones;

// Etiqueta de color para estatus y etapas.
export function Pill({ tone = "slate", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pillTones[tone]}`}>{children}</span>;
}
