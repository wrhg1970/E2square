import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Estado vacío que guía: qué es esta pantalla, qué hacer y el botón para hacerlo.
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background px-6 py-10 text-center shadow-sm">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-teal-700"><Icon aria-hidden className="size-6" /></span>
      <p className="mt-4 text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
