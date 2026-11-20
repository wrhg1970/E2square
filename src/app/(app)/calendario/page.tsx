import Link from "next/link";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, type ActivityRow } from "@/modules/activities/activity-panel";
import { activityTypes } from "@/modules/activities/labels";
import { addDays, dayIn, weekStart, zonedToUtc } from "@/modules/activities/time";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);

// Calendario interno: semana de actividades (pendientes y hechas) de un vendedor. RLS limita a quién puedes ver.
export default async function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: meId } = await supabase.rpc("current_profile_id");
  const [{ data: me }, { data: people }] = await Promise.all([
    supabase.from("profiles").select("id, timezone").eq("id", meId).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email").eq("status", "active").order("full_name"),
  ]);
  if (!me) return null;
  const tz = me.timezone;
  const today = dayIn(new Date(), tz);
  const start = weekStart(isDate(sp.semana) ? sp.semana : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const owner = uuid(sp.vendedor) ?? me.id;

  const from = zonedToUtc(`${start}T00:00`, tz).toISOString();
  const to = zonedToUtc(`${addDays(start, 7)}T00:00`, tz).toISOString();
  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .eq("owner_id", owner)
    .neq("status", "cancelled")
    .gte("due_at", from)
    .lt("due_at", to)
    .order("due_at")
    .limit(500);
  const rows = (data ?? []) as ActivityRow[];
  const instIds = [...new Set(rows.map((a) => a.institution_id).filter(Boolean))] as string[];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));
  const time = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dayLabel = (d: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
  const qs = (semana: string) => `/calendario?${new URLSearchParams({ semana, ...(owner !== me.id && { vendedor: owner }) })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">Semana del {dayLabel(start)} al {dayLabel(addDays(start, 6))}</p>
        </div>
        <nav aria-label="Semana" className="flex gap-1 text-sm">
          <Link href={qs(addDays(start, -7))} className="rounded-md border border-border px-3 py-2 hover:bg-muted">← Anterior</Link>
          <Link href={qs(weekStart(today))} className="rounded-md border border-border px-3 py-2 hover:bg-muted">Hoy</Link>
          <Link href={qs(addDays(start, 7))} className="rounded-md border border-border px-3 py-2 hover:bg-muted">Siguiente →</Link>
        </nav>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="semana" value={start} />
        <SelectField label="Vendedor" name="vendedor" defaultValue={owner} options={(people ?? []).map((p) => ({ value: p.id, label: p.id === me.id ? "Yo" : p.full_name || p.email }))} />
        <button type="submit" className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Ver</button>
      </form>

      {error && <p role="alert" className="text-sm text-red-700">No se pudo cargar el calendario. Recarga la página.</p>}

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const items = rows.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) === d);
          return (
            <section key={d} aria-label={dayLabel(d)} className={`min-h-28 space-y-2 rounded-xl border p-3 ${d === today ? "border-primary" : "border-border"}`}>
              <h2 className={`text-sm capitalize ${d === today ? "font-semibold" : "text-muted-foreground"}`}>{dayLabel(d)}</h2>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Libre</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((a) => {
                    const overdue = a.status === "pending" && new Date(a.due_at!) < new Date();
                    const href = a.opportunity_id ? `/oportunidades/${a.opportunity_id}` : a.institution_id ? `/instituciones/${a.institution_id}` : "/mi-dia";
                    return (
                      <li key={a.id} className="rounded-md bg-muted/60 p-2 text-xs">
                        <p className={overdue ? "font-medium text-red-700" : "text-muted-foreground"}>
                          {time(a.due_at!)} · {activityTypes[a.activity_type as keyof typeof activityTypes]}
                          {a.status === "done" && " · Hecha"}
                          {overdue && " · Vencida"}
                        </p>
                        <Link href={href} className={`block font-medium underline ${a.status === "done" ? "line-through" : ""}`}>{a.subject}</Link>
                        {a.institution_id && <p className="text-muted-foreground">{instName.get(a.institution_id)}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Las actividades sin fecha no aparecen aquí; están en Mi día, en “Sin fecha”.</p>
    </div>
  );
}
