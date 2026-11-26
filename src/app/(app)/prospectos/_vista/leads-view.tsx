import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { bulkLeads, setLeadStatus, updateLeadNotes } from "@/modules/leads/actions";
import { ContactLinks } from "@/modules/leads/contact-links";
import { leadStatuses, leadStatusTone, receivedAgo, type LeadStatus } from "@/modules/leads/labels";
import { BulkBar, RowCheck, SelectAll } from "@/modules/leads/selection";
import { StatusButtons } from "@/modules/leads/status-buttons";
import { Avatar, hrefFor, LeadFilters, place, profile, th, type ViewProps } from "./shared";

// Tabla a la izquierda y ficha del prospecto a la derecha, con "Siguiente" para avanzar sin volver a la lista.
export function LeadsView(p: ViewProps & { now?: Date }) {
  const { leads, byStatus, all, productName, selected, status, q, now = new Date() } = p;
  const i = leads.findIndex((l) => l.id === selected);
  const cur = i >= 0 ? leads[i] : null;
  const next = i >= 0 ? leads[i + 1] : null;
  const estatus = p.archived ? "archivados" : status;
  return (
    <>
      {/* En celular, con una ficha abierta, solo se ve la ficha. */}
      <div className={`grid-cols-2 gap-3 lg:grid lg:grid-cols-4 ${cur ? "hidden" : "grid"}`}>
        <StatTile label="Prospectos" value={all} />
        <StatTile label="Sin contactar" value={byStatus.new} hint="Estatus Nuevo" tone={byStatus.new ? "warn" : "default"} />
        <StatTile label="En contacto" value={byStatus.contacting} />
        <StatTile label="Interesados" value={byStatus.qualified} hint={`${byStatus.converted} convertidos`} tone="good" />
      </div>
      <div className={cur ? "hidden lg:contents" : "contents"}>
        <LeadFilters {...p} />
        <BulkBar action={bulkLeads} archived={p.archived} />
      </div>
      <div className={`grid items-start gap-4 ${cur ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}>
        <div className={`table-card ${cur ? "hidden lg:block" : ""}`}>
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-10 py-2 pl-4"><SelectAll /></th>
                <th className={th}>Prospecto</th>
                <th className={`${th} hidden md:table-cell`}>Ciudad</th>
                <th className={`${th} hidden sm:table-cell`}>Recibido</th>
                <th className={th}>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className={`border-t border-border ${l.id === selected ? "bg-teal-50/70 shadow-[inset_3px_0_var(--primary)]" : "hover:bg-slate-50"}`}>
                  <td className="w-10 min-w-0 py-2.5 pl-4"><RowCheck id={l.id} name={l.full_name} /></td>
                  <td className="px-3 py-2.5">
                    <Link href={hrefFor({ estatus, q, id: l.id })} scroll={false} className="block min-w-0">
                      <span className="block font-semibold">{l.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ")}</span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">{place(l) || "—"}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground sm:table-cell">{l.received_at ? receivedAgo(l.received_at, now) : "—"}</td>
                  <td className="px-3 py-2.5"><Pill tone={leadStatusTone[l.status as LeadStatus]}>{leadStatuses[l.status as LeadStatus]}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cur && (
          <aside aria-label={`Ficha de ${cur.full_name}`} className="space-y-4 rounded-xl border border-border bg-background p-5 shadow-sm lg:sticky lg:top-16">
            <div className="flex items-start gap-3">
              <Avatar name={cur.full_name} />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold leading-tight">{cur.full_name}</h2>
                <p className="text-xs text-muted-foreground">{profile(cur) || "—"}</p>
              </div>
              <Link href={hrefFor({ estatus, q })} scroll={false} aria-label="Cerrar ficha" className={buttonVariants({ variant: "ghost", size: "icon" }) + " size-8"}><X aria-hidden className="size-4" /></Link>
            </div>
            <ContactLinks email={cur.email} phone={cur.phone} country={cur.country} name={cur.full_name} labels />
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Correo</dt><dd className="break-all">{cur.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Teléfono</dt><dd>{cur.phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Lugar</dt><dd>{[place(cur), cur.country].filter(Boolean).join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Edad y grado</dt><dd>{[cur.age_range, cur.grade].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-muted-foreground">Producto</dt><dd>{(cur.product_id && productName.get(cur.product_id)) ?? "—"}</dd>
              <dt className="text-muted-foreground">Recibido</dt><dd>{cur.received_at ? receivedAgo(cur.received_at, now) : "—"}</dd>
            </dl>
            <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Estatus</p><StatusButtons key={cur.id} action={setLeadStatus.bind(null, cur.id)} current={cur.status as LeadStatus} /></div>
            <ActionForm key={cur.id} action={updateLeadNotes.bind(null, cur.id)} submitLabel="Guardar notas" submitVariant="outline">
              <TextareaField label="Notas de seguimiento" name="notes" rows={3} maxLength={4000} defaultValue={cur.notes ?? ""} placeholder="Qué platicaron y qué sigue" />
            </ActionForm>
            {next && <Link href={hrefFor({ estatus, q, id: next.id })} scroll={false} className={buttonVariants() + " w-full"}>Siguiente: {next.full_name} <ArrowRight aria-hidden className="size-4" /></Link>}
          </aside>
        )}
      </div>
    </>
  );
}
