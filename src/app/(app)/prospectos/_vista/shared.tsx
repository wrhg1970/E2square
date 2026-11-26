import { Search } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { leadStatuses, type LeadStatus } from "@/modules/leads/labels";

export type LeadRow = {
  id: string; full_name: string; email: string | null; phone: string | null; city: string | null; region: string | null; country: string | null;
  respondent: string | null; age_range: string | null; grade: string | null; received_at: string | null; notes: string | null; status: string; product_id: string | null;
};
export type ViewProps = {
  leads: LeadRow[]; byStatus: Record<LeadStatus, number>; all: number; status: LeadStatus | null; q: string;
  productName: Map<string, string>; selected: string | null; count: number; limit: number; archived: boolean; archivedCount: number;
};
export const statusKeys = Object.keys(leadStatuses) as LeadStatus[];
export const place = (l: LeadRow) => [l.city, l.region].filter(Boolean).join(", ");
export const profile = (l: LeadRow) => [l.respondent, l.age_range, l.grade].filter(Boolean).join(" · ");
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
export const hrefFor = (p: { estatus?: string | null; q?: string; id?: string | null }) =>
  `/prospectos?${new URLSearchParams({ ...(p.estatus && { estatus: p.estatus }), ...(p.q && { q: p.q }), ...(p.id && { id: p.id }) })}`;
export const th = "px-3 py-2 text-xs font-bold uppercase tracking-wide whitespace-nowrap";

export function Avatar({ name }: { name: string }) {
  return <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-band-2 text-xs font-bold text-white">{initials(name)}</span>;
}

export function LeadFilters({ byStatus, all, status, q, archived, archivedCount }: Pick<ViewProps, "byStatus" | "all" | "status" | "q" | "archived" | "archivedCount">) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {(
        <Segmented label="Filtrar por estatus" items={[
          { href: hrefFor({ q }), label: `Todos (${all})`, current: !status && !archived },
          ...statusKeys.map((s) => ({ href: hrefFor({ estatus: s, q }), label: `${leadStatuses[s]} (${byStatus[s]})`, current: status === s && !archived })),
          { href: hrefFor({ estatus: "archivados", q }), label: `Archivados (${archivedCount})`, current: archived },
        ]} />
      )}
      <form role="search" className="w-full sm:w-72">
        {(archived || status) && <input type="hidden" name="estatus" value={archived ? "archivados" : status!} />}
        <label className="relative block">
          <span className="sr-only">Buscar prospecto</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" name="q" defaultValue={q} placeholder="Nombre, correo, teléfono o ciudad"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
        </label>
      </form>
    </div>
  );
}
