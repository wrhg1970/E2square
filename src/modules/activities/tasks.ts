import type { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, type ActivityRow } from "./activity-panel";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const taskViews = {
  mias: "Mis pendientes",
  asignadas: "Me asignaron",
  asigne: "Asigné a otros",
  vencidas: "Vencidas",
  hechas: "Hechas",
} as const;
export type TaskView = keyof typeof taskViews;

export const isTaskView = (v: unknown): v is TaskView => typeof v === "string" && v in taskViews;

// Asignada = la creó otra persona a mano. Las tareas que crean las campañas (campaign_id) no cuentan como asignación personal.
export function pendingTaskQuery(supabase: Supabase, me: string, view: Exclude<TaskView, "hechas">) {
  const q = supabase.from("activities").select(ACTIVITY_COLUMNS).eq("status", "pending");
  switch (view) {
    case "mias": return q.eq("owner_id", me);
    case "asignadas": return q.eq("owner_id", me).neq("created_by", me).is("campaign_id", null);
    case "asigne": return q.eq("created_by", me).neq("owner_id", me).is("campaign_id", null);
    case "vencidas": return q.lt("due_at", new Date().toISOString()).or(`owner_id.eq.${me},and(created_by.eq.${me},campaign_id.is.null)`);
  }
}

export function doneTaskQuery(supabase: Supabase, me: string, sinceDays = 30) {
  return supabase.from("activities").select(ACTIVITY_COLUMNS).eq("status", "done")
    .gte("completed_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString())
    .or(`owner_id.eq.${me},and(created_by.eq.${me},campaign_id.is.null)`);
}

// Si la consulta falla (p. ej. una columna aún no existe en la base), se muestra vacío en vez de romper la pantalla.
export async function rowsOrEmpty(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<{ rows: ActivityRow[]; failed: boolean }> {
  const { data, error } = await q;
  return { rows: error ? [] : ((data ?? []) as ActivityRow[]), failed: Boolean(error) };
}

// Nombres para mostrar responsable y quien asignó; "Yo" para el usuario actual.
export async function loadPeople(supabase: Supabase, me: string) {
  const { data } = await supabase.from("profiles").select("id, full_name, email, status").order("full_name");
  const people = new Map((data ?? []).map((p) => [p.id, p.id === me ? "Yo" : p.full_name || p.email]));
  const assignees = (data ?? []).filter((p) => p.status === "active" && p.id !== me).map((p) => ({ value: p.id, label: p.full_name || p.email }));
  return { people, assignees };
}
