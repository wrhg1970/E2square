import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { addActivityToCalendar } from "@/modules/google/actions";
import { googleEnv } from "@/modules/google/config";
import { toOptions } from "@/modules/institutions/labels";
import { cancelActivity, completeActivity, createActivity } from "./actions";
import { activityTypes, priorities } from "./labels";
import { formatDateTime } from "./time";

export type ActivityRow = {
  id: string; activity_type: string; subject: string; status: string; due_at: string | null; completed_at: string | null;
  outcome: string | null; notes: string | null; priority: string; owner_id: string; institution_id: string | null; opportunity_id: string | null;
  google_event_id: string | null;
};

export const ACTIVITY_COLUMNS = "id, activity_type, subject, status, due_at, completed_at, outcome, notes, priority, owner_id, institution_id, opportunity_id, google_event_id";

// Formulario para cerrar una actividad, con la opción de programar la siguiente.
export function CompleteForm({ id }: { id: string }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs underline">Completar</summary>
      <ActionForm action={completeActivity.bind(null, id)} submitLabel="Completar" className="mt-2 grid gap-2 sm:grid-cols-3 sm:items-end">
        <Field label="Resultado" name="outcome" className="sm:col-span-3" />
        <Field label="Siguiente actividad" name="next_subject" placeholder="Enviar propuesta" />
        <SelectField label="Tipo" name="next_type" options={toOptions(activityTypes)} defaultValue="follow_up" />
        <Field label="Fecha y hora" name="next_due_local" type="datetime-local" />
      </ActionForm>
    </details>
  );
}

export function ActivityItem({ a, timeZone, people, canAct, context }: { a: ActivityRow; timeZone: string; people: Map<string, string>; canAct: boolean; context?: React.ReactNode }) {
  const overdue = a.status === "pending" && a.due_at && new Date(a.due_at) < new Date();
  return (
    <li className="space-y-1 py-3 text-sm first:pt-0">
      <p className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-border px-1.5 py-0.5 text-xs">{activityTypes[a.activity_type as keyof typeof activityTypes]}</span>
        <span className={a.status === "cancelled" ? "line-through" : "font-medium"}>{a.subject}</span>
        {a.priority === "high" && a.status === "pending" && <span className="text-xs font-medium text-red-700">Prioridad alta</span>}
      </p>
      <p className={overdue ? "font-medium text-red-700" : "text-muted-foreground"}>
        {a.status === "done" && a.completed_at ? `Hecha ${formatDateTime(a.completed_at, timeZone)}` : a.due_at ? `${overdue ? "Vencida: " : ""}${formatDateTime(a.due_at, timeZone)}` : "Sin fecha"}
        {` · ${people.get(a.owner_id) ?? ""}`}
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
    </li>
  );
}

// Nueva actividad ligada a una institución u oportunidad. "Ya se realizó" = captura rápida.
export function NewActivityForm({ institutionId, opportunityId, contacts = [] }: { institutionId?: string; opportunityId?: string; contacts?: { value: string; label: string }[] }) {
  return (
    <ActionForm action={createActivity} submitLabel="Guardar actividad" className="grid gap-3 sm:grid-cols-3 sm:items-end">
      {institutionId && <input type="hidden" name="institution_id" value={institutionId} />}
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      <SelectField label="Tipo" name="activity_type" options={toOptions(activityTypes)} defaultValue="call" />
      <Field label="Asunto" name="subject" required className="sm:col-span-2" />
      <Field label="Fecha y hora" name="due_local" type="datetime-local" />
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
