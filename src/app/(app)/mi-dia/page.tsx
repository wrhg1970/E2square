import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, ActivityItem, NewActivityForm, type ActivityRow } from "@/modules/activities/activity-panel";
import { dayIn } from "@/modules/activities/time";
import { loadPeople, pendingTaskQuery, rowsOrEmpty } from "@/modules/activities/tasks";
import { loadScores } from "@/modules/institutions/scoring";
import { formatMoney } from "@/modules/opportunities/labels";
import { formatDay } from "@/modules/activities/time";
import { CalendarCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { StatTile } from "@/components/ui/stat-tile";

// Bloque de la lista; los vacíos no se muestran para que lo importante quede arriba sin desplazarse.
function Block({ title, count, children, tone, hint }: { title: string; count: number; children: ReactNode; tone?: "alert"; hint?: string }) {
  if (count === 0) return null;
  return (
    <section className={`space-y-2 rounded-xl border bg-background p-5 shadow-sm ${tone === "alert" ? "border-red-200 border-l-4 border-l-red-500" : "border-border"}`}>
      <h2 className={`flex items-center gap-2 font-semibold ${tone === "alert" ? "text-red-700" : ""}`}>
        {title} <span className="rounded-full bg-muted px-2 text-xs font-bold text-foreground">{count}</span>
      </h2>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

export default async function MyDayPage() {
  const supabase = await createClient();
  const { data: meId } = await supabase.rpc("current_profile_id");
  const { data: me } = await supabase.from("profiles").select("id, full_name, timezone").eq("id", meId).maybeSingle();
  if (!me) return null;
  const tz = me.timezone;
  const now = new Date();
  const today = dayIn(now, tz);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const dayStart = new Date(now.getTime() - 36 * 3_600_000).toISOString();

  const [pending, doneToday, idleOpps, lateOpps, myInsts, toMeQ, byMeQ, { people, assignees }] = await Promise.all([
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("owner_id", me.id).eq("status", "pending").or(`due_at.lte.${weekAhead},due_at.is.null`).order("due_at", { nullsFirst: false }).limit(200),
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("owner_id", me.id).eq("status", "done").gte("completed_at", dayStart).order("completed_at", { ascending: false }),
    supabase.from("opportunities").select("id, name, institution_id, amount, currency_code").eq("owner_id", me.id).eq("status", "open").is("next_activity_at", null).order("amount", { ascending: false }).limit(50),
    supabase.from("opportunities").select("id, name, institution_id, expected_close_date").eq("owner_id", me.id).eq("status", "open").lt("expected_close_date", today).order("expected_close_date").limit(50),
    // shortcut: solo las 200 con interacción más antigua; paginar si un vendedor tiene más cartera.
    supabase.from("institutions").select("id, name").eq("owner_id", me.id).order("last_activity_at", { nullsFirst: true }).limit(200),
    // Si estas consultas fallan (base sin migrar), Mi día sigue funcionando sin los bloques de asignación.
    rowsOrEmpty(pendingTaskQuery(supabase, me.id, "asignadas").order("due_at", { nullsFirst: false }).limit(200)),
    rowsOrEmpty(pendingTaskQuery(supabase, me.id, "asigne").order("due_at", { nullsFirst: false }).limit(200)),
    loadPeople(supabase, me.id),
  ]);
  const toMe = toMeQ.rows;
  const byMe = byMeQ.rows;
  const toMeIds = new Set(toMe.map((a) => a.id));
  // Siguiente mejor acción: instituciones propias sin oportunidad abierta, de mayor a menor puntaje.
  const scores = await loadScores(supabase, (myInsts.data ?? []).map((i) => i.id));
  const prospects = (myInsts.data ?? [])
    .map((i) => ({ ...i, s: scores.get(i.id) }))
    .filter((i) => i.s && i.s.factors.find((f) => f.key === "need")?.value === 0)
    .sort((a, b) => (b.s?.score ?? 0) - (a.s?.score ?? 0))
    .slice(0, 5);
  // Mis tareas: lo que me toca, sin las que me asignaron (esas van en su propio bloque).
  const rows = ((pending.data ?? []) as ActivityRow[]).filter((a) => !toMeIds.has(a.id));
  const dueIn = (list: ActivityRow[], test: (day: string) => boolean) => list.filter((a) => a.due_at && new Date(a.due_at) < now && test(dayIn(new Date(a.due_at), tz))).length;
  const overdue = rows.filter((a) => a.due_at && new Date(a.due_at) < now && dayIn(new Date(a.due_at), tz) < today);
  const todays = rows.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) === today);
  const upcoming = rows.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) > today);
  // Recordatorios ya vencidos de actividades de días futuros (las de hoy ya están en "Hoy").
  const reminders = upcoming.filter((a) => a.reminder_at && new Date(a.reminder_at) <= now);
  const undated = rows.filter((a) => !a.due_at);
  const completed = ((doneToday.data ?? []) as ActivityRow[]).filter((a) => a.completed_at && dayIn(new Date(a.completed_at), tz) === today);

  const instIds = [...new Set([...rows, ...completed, ...toMe, ...byMe].map((a) => a.institution_id).concat([...(idleOpps.data ?? []), ...(lateOpps.data ?? [])].map((o) => o.institution_id)).filter(Boolean))] as string[];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));
  const where = (a: ActivityRow) =>
    a.institution_id ? <Link href={a.opportunity_id ? `/oportunidades/${a.opportunity_id}` : `/instituciones/${a.institution_id}`} className="underline">{instName.get(a.institution_id)}</Link> : null;
  const overdueAll = overdue.length + dueIn(toMe, (d) => d < today);
  const idle = idleOpps.data ?? [];
  const late = lateOpps.data ?? [];
  const nothing = !reminders.length && !overdue.length && !todays.length && !idle.length && !late.length && !prospects.length && !upcoming.length && !undated.length && !completed.length && !toMe.length && !byMe.length;
  const list = (items: ActivityRow[]) => (
    <ul className="divide-y divide-border">{items.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={people} canAct context={where(a)} />)}</ul>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mi día</h1>
            <p className="text-sm text-muted-foreground first-letter:uppercase">{new Intl.DateTimeFormat("es-MX", { timeZone: tz, dateStyle: "full" }).format(now)}</p>
          </div>
          <Link href="/calendario" className={buttonVariants({ variant: "outline" })}>Ver mi semana</Link>
        </div>
        <div className="on-light grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Vencidas" value={overdueAll} tone={overdueAll ? "alert" : "default"} hint={overdueAll ? "Atiéndelas primero" : "Ninguna"} />
          <StatTile label="Para hoy" value={todays.length + toMe.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) === today).length} />
          <StatTile label="Sin próxima actividad" value={idle.length} tone={idle.length ? "warn" : "default"} hint="Oportunidades abiertas" />
          <StatTile label="Hechas hoy" value={completed.length} tone={completed.length ? "good" : "default"} />
        </div>
      </div>

      <Reveal label="Nueva tarea" title="Tarea para ti o para alguien del equipo" variant="outline"><NewActivityForm assignees={assignees} defaultType="internal_task" submitLabel="Guardar tarea" /></Reveal>

      {nothing && (
        <EmptyState icon={CalendarCheck} title="Todo al día"
          action={<Link href="/instituciones" className={buttonVariants()}>Ir a mis instituciones</Link>}>
          No tienes tareas pendientes ni oportunidades sin seguimiento. Programa la siguiente llamada o visita desde la ficha de una institución u oportunidad y aparecerá aquí el día que toque.
        </EmptyState>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {reminders.length > 0 && <Block title="Recordatorios" count={reminders.length} tone="alert">{list(reminders)}</Block>}
        <Block title="Mis vencidas" count={overdue.length} tone="alert">{list(overdue)}</Block>
        <Block title="Mis tareas de hoy" count={todays.length}>{list(todays)}</Block>
        <Block title="Me asignaron" count={toMe.length} hint="Tareas que otra persona te asignó, de la más próxima a la más lejana.">{list(toMe)}</Block>
        <Block title="Asigné a otros" count={byMe.length} hint="Pendientes de otras personas: responsable y fecha.">{list(byMe)}</Block>
        <Block title="Oportunidades sin próxima actividad" count={idle.length} tone="alert" hint="Abre cada una y programa la siguiente llamada o visita.">
          <ul className="divide-y divide-border text-sm">
            {idle.map((o) => (
              <li key={o.id} className="flex justify-between gap-2 py-2">
                <Link href={`/oportunidades/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                <span className="text-muted-foreground">{instName.get(o.institution_id)} · {formatMoney(o.amount, o.currency_code)}</span>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Cierre estimado ya pasó" count={late.length} tone="alert" hint="Actualiza la fecha de cierre, avanza la etapa o márcala como perdida.">
          <ul className="divide-y divide-border text-sm">
            {late.map((o) => (
              <li key={o.id} className="flex justify-between gap-2 py-2">
                <Link href={`/oportunidades/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                <span className="text-muted-foreground">{instName.get(o.institution_id)} · cierre {formatDay(o.expected_close_date!)}</span>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Instituciones para abrir oportunidad" count={prospects.length} hint="Tus instituciones sin oportunidad abierta con mejor puntaje.">
          <ul className="divide-y divide-border text-sm">
            {prospects.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/instituciones/${i.id}`} className="font-medium hover:underline">{i.name}</Link>
                <span className="flex gap-3">
                  <span className="text-muted-foreground tabular-nums">Puntaje {i.s?.score ?? "—"}</span>
                  <Link href={`/oportunidades/nueva?institucion=${i.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Crear oportunidad</Link>
                </span>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Próximos 7 días" count={upcoming.length}>{list(upcoming)}</Block>
        <Block title="Sin fecha" count={undated.length}>{list(undated)}</Block>
        <Block title="Completadas hoy" count={completed.length}>{list(completed)}</Block>
      </div>
    </div>
  );
}
