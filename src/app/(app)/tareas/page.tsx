import Link from "next/link";
import { ListTodo } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal } from "@/components/ui/reveal";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { createClient } from "@/lib/supabase/server";
import { ActivityItem, NewActivityForm } from "@/modules/activities/activity-panel";
import { doneTaskQuery, isTaskView, loadPeople, pendingTaskQuery, rowsOrEmpty, taskViews } from "@/modules/activities/tasks";

const emptyText: Record<keyof typeof taskViews, string> = {
  mias: "No tienes tareas pendientes. Crea una arriba o espera a que alguien te asigne una.",
  asignadas: "Nadie te ha asignado tareas pendientes.",
  asigne: "No tienes tareas pendientes asignadas a otras personas. Usa «Nueva tarea» y elige el responsable.",
  vencidas: "Ninguna tarea vencida. Bien.",
  hechas: "No hay tareas hechas en los últimos 30 días.",
};

export default async function TasksPage({ searchParams }: PageProps<"/tareas">) {
  const sp = await searchParams;
  const view = isTaskView(sp.ver) ? sp.ver : "mias";
  const supabase = await createClient();
  const { data: meId } = await supabase.rpc("current_profile_id");
  const [{ data: me }, { data: canWrite }] = await Promise.all([
    supabase.from("profiles").select("id, timezone").eq("id", meId).maybeSingle(),
    supabase.rpc("has_permission", { permission: "institutions.write" }),
  ]);
  if (!me) return null;
  const tz = me.timezone;

  const [mine, toMe, byMe, late, list, { people, assignees }] = await Promise.all([
    rowsOrEmpty(pendingTaskQuery(supabase, me.id, "mias").order("due_at", { nullsFirst: false }).limit(500)),
    rowsOrEmpty(pendingTaskQuery(supabase, me.id, "asignadas").limit(500)),
    rowsOrEmpty(pendingTaskQuery(supabase, me.id, "asigne").limit(500)),
    rowsOrEmpty(pendingTaskQuery(supabase, me.id, "vencidas").limit(500)),
    rowsOrEmpty(view === "hechas"
      ? doneTaskQuery(supabase, me.id).order("completed_at", { ascending: false }).limit(200)
      : pendingTaskQuery(supabase, me.id, view).order("due_at", { nullsFirst: false }).limit(300)),
    loadPeople(supabase, me.id),
  ]);

  const instIds = [...new Set(list.rows.map((a) => a.institution_id).filter(Boolean))] as string[];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="text-sm text-muted-foreground">Crea tareas para ti o asígnalas a alguien del equipo. A cada responsable le aparecen en su Mi día.</p>
        </div>
        <div className="on-light grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Mis pendientes" value={mine.rows.length} />
          <StatTile label="Me asignaron" value={toMe.rows.length} hint="Pendientes" />
          <StatTile label="Asigné a otros" value={byMe.rows.length} hint="Pendientes" />
          <StatTile label="Vencidas" value={late.rows.length} tone={late.rows.length ? "alert" : "default"} hint={late.rows.length ? "Mías o que asigné" : "Ninguna"} />
        </div>
      </div>

      {canWrite && (
        <Reveal label="Nueva tarea" title="Nueva tarea">
          <NewActivityForm assignees={assignees} defaultType="internal_task" submitLabel="Guardar tarea" />
        </Reveal>
      )}

      <Segmented label="Ver tareas" items={Object.entries(taskViews).map(([k, label]) => ({ href: `/tareas?ver=${k}`, label, current: view === k }))} />

      {list.failed ? (
        <p role="alert" className="text-sm text-red-700">No se pudieron cargar estas tareas. Recarga la página.</p>
      ) : list.rows.length === 0 ? (
        <EmptyState icon={ListTodo} title={taskViews[view]}>{emptyText[view]}</EmptyState>
      ) : (
        <section className="rounded-xl border border-border bg-background p-5 shadow-sm">
          <ul className="divide-y divide-border">
            {list.rows.map((a) => (
              <ActivityItem key={a.id} a={a} timeZone={tz} people={people}
                canAct={Boolean(canWrite) || a.owner_id === me.id}
                context={a.institution_id ? <> · <Link href={a.opportunity_id ? `/oportunidades/${a.opportunity_id}` : `/instituciones/${a.institution_id}`} className="underline">{instName.get(a.institution_id) ?? "Institución"}</Link></> : null} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
