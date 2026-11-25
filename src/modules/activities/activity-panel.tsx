import { CalendarCheck, Check, ClipboardList, FileText, Mail, MapPin, MessageCircle, Phone, Presentation, RotateCw, User, Users, Video, X, type LucideIcon } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { buttonVariants } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { addActivityToCalendar } from "@/modules/google/actions";
import { googleEnv } from "@/modules/google/config";
import { toOptions } from "@/modules/institutions/labels";
import { cancelActivity, completeActivity, createActivity } from "./actions";
import { activityTypes, priorities } from "./labels";
import { addDays, dayIn, formatDateTime } from "./time";

export type ActivityRow = {
  id: string; activity_type: string; subject: string; status: string; due_at: string | null; completed_at: string | null;
  outcome: string | null; notes: string | null; priority: string; owner_id: string; institution_id: string | null; opportunity_id: string | null;
  google_event_id: string | null; reminder_at: string | null; created_by: string | null;
};

export const ACTIVITY_COLUMNS = "id, activity_type, subject, status, due_at, completed_at, outcome, notes, priority, owner_id, institution_id, opportunity_id, google_event_id, reminder_at, created_by";

const typeIcon: Record<string, LucideIcon> = {
  call: Phone, email: Mail, whatsapp: MessageCircle, visit: MapPin, meeting: Users, video_call: Video,
  presentation: Presentation, proposal: FileText, follow_up: RotateCw, internal_task: ClipboardList,
};
const summaryBtn = (variant: "outline" | "ghost") =>
  `${buttonVariants({ variant, size: "sm" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`;
// Sin nombre en el perfil se muestra el usuario del correo, no la dirección completa.
const shortName = (label?: string) => (label?.includes("@") ? label.split("@")[0] : label);

// Formulario para cerrar una actividad, con la opción de programar la siguiente.
export function CompleteForm({ id }: { id: string }) {
  return (
    <details className="group/complete open:basis-full">
      <summary className={`${summaryBtn("outline")} group-open/complete:bg-muted`}><Check className="size-4 text-primary" aria-hidden />Completar</summary>
      <ActionForm action={completeActivity.bind(null, id)} submitLabel="Marcar como hecha" className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <Field label="¿Cómo te fue? (resultado)" name="outcome" placeholder="Pidió propuesta para enero" />
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Siguiente paso · opcional</legend>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-end">
            <Field label="Qué sigue" name="next_subject" placeholder="Enviar propuesta" />
            <SelectField label="Tipo" name="next_type" options={toOptions(activityTypes)} defaultValue="follow_up" />
            <Field label="Cuándo" name="next_due_local" type="datetime-local" />
          </div>
        </fieldset>
      </ActionForm>
    </details>
  );
}

// Cancelar pide confirmación sin JavaScript: el botón real queda detrás de un segundo clic.
function CancelButton({ id }: { id: string }) {
  return (
    <details className="group/cancel">
      <summary className={`${summaryBtn("ghost")} text-muted-foreground`}><X className="size-4" aria-hidden />Cancelar</summary>
      <form action={cancelActivity.bind(null, id)} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span>¿Cancelar esta actividad?</span>
        <button type="submit" className={`${buttonVariants({ variant: "outline", size: "sm" })} border-red-200 text-red-700 hover:bg-red-50`}>Sí, cancelar</button>
      </form>
    </details>
  );
}

function When({ a, timeZone }: { a: ActivityRow; timeZone: string }) {
  if (a.status === "done") return <Pill tone="teal">Hecha{a.completed_at ? ` · ${formatDateTime(a.completed_at, timeZone)}` : ""}</Pill>;
  if (a.status === "cancelled") return <Pill>Cancelada</Pill>;
  if (!a.due_at) return <Pill>Sin fecha</Pill>;
  const due = new Date(a.due_at);
  const today = dayIn(new Date(), timeZone);
  const day = dayIn(due, timeZone);
  const time = new Intl.DateTimeFormat("es-MX", { timeZone, hour: "2-digit", minute: "2-digit" }).format(due);
  if (due < new Date() && day <= today) return <Pill tone="red">Vencida · {formatDateTime(a.due_at, timeZone)}</Pill>;
  if (day === today) return <Pill tone="amber">Hoy · {time}</Pill>;
  if (day === addDays(today, 1)) return <Pill tone="sky">Mañana · {time}</Pill>;
  return <Pill tone="slate">{formatDateTime(a.due_at, timeZone)}</Pill>;
}

export function ActivityItem({ a, timeZone, people, canAct, context }: { a: ActivityRow; timeZone: string; people: Map<string, string>; canAct: boolean; context?: React.ReactNode }) {
  const overdue = a.status === "pending" && a.due_at && new Date(a.due_at) < new Date();
  const assignedBy = a.created_by && a.created_by !== a.owner_id ? people.get(a.created_by) : undefined;
  return (
    <li className="space-y-1 py-3 text-sm first:pt-0">
      <p className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-border px-1.5 py-0.5 text-xs">{activityTypes[a.activity_type as keyof typeof activityTypes]}</span>
        <span className={a.status === "cancelled" ? "line-through" : "font-medium"}>{a.subject}</span>
        {a.priority === "high" && a.status === "pending" && <span className="text-xs font-medium text-red-700">Prioridad alta</span>}
      </p>
      <p className={overdue ? "font-medium text-red-700" : "text-muted-foreground"}>
        {a.status === "done" && a.completed_at ? `Hecha ${formatDateTime(a.completed_at, timeZone)}` : a.due_at ? `${overdue ? "Vencida: " : ""}${formatDateTime(a.due_at, timeZone)}` : "Sin fecha"}
        {assignedBy ? ` · Responsable: ${people.get(a.owner_id) ?? "—"} · Asignó: ${assignedBy}` : ` · ${people.get(a.owner_id) ?? ""}`}
        {context}
      </p>
      {a.outcome && <p>Resultado: {a.outcome}</p>}
      {a.notes && <p className="whitespace-pre-line text-muted-foreground">{a.notes}</p>}
      {a.google_event_id && <p className="text-xs text-muted-foreground">En Google Calendar</p>}
      {canAct && a.status === "pending" && (
        <div className="flex flex-wrap items-start gap-4">
          <CompleteForm id={a.id} />
          <form action={cancelActivity.bind(null, a.id)}>
            <button type="submit" className="text-xs text-muted-foreground underline">Cancelar</button>
          </form>
          {a.due_at && !a.google_event_id && googleEnv() && (
            <ActionForm action={addActivityToCalendar.bind(null, a.id)} submitLabel="Agregar a Google Calendar" className="text-xs">
              {null}
            </ActionForm>
          )}
        </div>
      )}
  const Icon = typeIcon[a.activity_type] ?? ClipboardList;
  const owner = shortName(people.get(a.owner_id));
  return (
    <li className="flex gap-3 py-4 text-sm first:pt-0 last:pb-0">
      <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${a.status === "pending" ? "bg-primary/15 text-teal-800" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={a.status === "cancelled" ? "text-muted-foreground line-through" : "font-semibold"}>{a.subject}</span>
          <span className="text-xs text-muted-foreground">{activityTypes[a.activity_type as keyof typeof activityTypes]}</span>
          {a.priority === "high" && a.status === "pending" && <Pill tone="red">Prioridad alta</Pill>}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <When a={a} timeZone={timeZone} />
          {owner && <span className="inline-flex items-center gap-1"><User className="size-3.5" aria-hidden />{owner}</span>}
          {a.google_event_id && <span className="inline-flex items-center gap-1 text-xs"><CalendarCheck className="size-3.5 text-primary" aria-hidden />En Google Calendar</span>}
          {context && <span>{context}</span>}
        </p>
        {a.outcome && <p><span className="text-muted-foreground">Resultado:</span> {a.outcome}</p>}
        {a.notes && <p className="whitespace-pre-line text-muted-foreground">{a.notes}</p>}
        {canAct && a.status === "pending" && (
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <CompleteForm id={a.id} />
            <CancelButton id={a.id} />
            {a.due_at && !a.google_event_id && googleEnv() && (
              <ActionForm action={addActivityToCalendar.bind(null, a.id)} submitLabel="Agregar a Google Calendar" submitVariant="outline" className="text-xs">
                {null}
              </ActionForm>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// Nueva actividad ligada a una institución u oportunidad. "Ya se realizó" = captura rápida.
// Con `assignees` aparece "Responsable" para asignarla a otra persona (vacío = yo).
export function NewActivityForm({ institutionId, opportunityId, contacts = [], assignees, defaultType = "call", submitLabel = "Guardar actividad" }: {
  institutionId?: string; opportunityId?: string; contacts?: { value: string; label: string }[];
  assignees?: { value: string; label: string }[]; defaultType?: keyof typeof activityTypes; submitLabel?: string;
}) {
  return (
    <ActionForm action={createActivity} submitLabel={submitLabel} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      {institutionId && <input type="hidden" name="institution_id" value={institutionId} />}
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      <SelectField label="Tipo" name="activity_type" options={toOptions(activityTypes)} defaultValue={defaultType} />
      <Field label="Asunto" name="subject" required className="sm:col-span-2" />
      {assignees && <SelectField label="Responsable" name="owner_id" options={[{ value: "", label: "Yo" }, ...assignees]} defaultValue="" />}
      <Field label="Fecha y hora" name="due_local" type="datetime-local" />
      <SelectField label="Recordatorio" name="reminder" defaultValue="" options={[
        { value: "", label: "Sin recordatorio" }, { value: "0", label: "A la hora" }, { value: "15", label: "15 min antes" },
        { value: "60", label: "1 hora antes" }, { value: "1440", label: "1 día antes" },
      ]} />
      <SelectField label="Prioridad" name="priority" options={toOptions(priorities)} defaultValue="normal" />
      {contacts.length > 0 ? (
        <SelectField label="Contacto" name="contact_id" options={[{ value: "", label: "Ninguno" }, ...contacts]} />
      ) : <span />}
      <TextareaField label="Notas" name="notes" className="sm:col-span-3" />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="done" /> Ya se realizó (registrar ahora)
      </label>
      <Field label="Resultado (si ya se realizó)" name="outcome" />
    </ActionForm>
  );
}
