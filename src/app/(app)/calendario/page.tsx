import Link from "next/link";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, type ActivityRow } from "@/modules/activities/activity-panel";
import { activityTypes } from "@/modules/activities/labels";
import { addDays, dayIn, weekStart, zonedToUtc } from "@/modules/activities/time";
import { buttonVariants } from "@/components/ui/button";
import { AutoForm } from "@/components/ui/auto-form";
import { Pill } from "@/components/ui/pill";

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
  const pending = rows.filter((a) => a.status === "pending");
  const overdueCount = pending.filter((a) => new Date(a.due_at!) < new Date()).length;
  const qs = (semana: string) => `/calendario?${new URLSearchParams({ semana, ...(owner !== me.id && { vendedor: owner }) })}`;

  return (
    <div className="space-y-6">
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">
            Semana del {dayLabel(start)} al {dayLabel(addDays(start, 6))} · {rows.length} {rows.length === 1 ? "actividad" : "actividades"} · {pending.length} pendientes
            {overdueCount > 0 && <> · <b className="text-amber-300">{overdueCount} vencidas</b></>}
          </p>
        </div>
        <nav aria-label="Semana" className="flex gap-1 text-sm">
          <Link href={qs(addDays(start, -7))} className={buttonVariants({ variant: "outline" })} aria-label="Semana anterior">←</Link>
          <Link href={qs(weekStart(today))} className={buttonVariants({ variant: "outline" })}>Esta semana</Link>
          <Link href={qs(addDays(start, 7))} className={buttonVariants({ variant: "outline" })} aria-label="Semana siguiente">→</Link>
        </nav>
      </div>

      {(people ?? []).length > 1 && (
        <AutoForm className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="semana" value={start} />
          <SelectField label="Ver la semana de" name="vendedor" defaultValue={owner} className="w-full sm:w-64"
            options={(people ?? []).map((p) => ({ value: p.id, label: p.id === me.id ? "Yo" : p.full_name || p.email }))} />
          <noscript><button type="submit" className={buttonVariants({ variant: "outline" })}>Ver</button></noscript>
        </AutoForm>
      )}

      {error && <p role="alert" className="text-sm text-red-700">No se pudo cargar el calendario. Recarga la página.</p>}

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const items = rows.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) === d);
          return (
            <section key={d} aria-label={dayLabel(d)} className={`space-y-2 rounded-xl border bg-background p-3 shadow-sm md:min-h-40 ${d === today ? "border-primary ring-1 ring-primary" : "border-border"} ${items.length === 0 && d !== today ? "max-md:hidden" : ""}`}>
              <h2 className={`text-sm first-letter:uppercase ${d === today ? "font-semibold" : "text-muted-foreground"}`}>{dayLabel(d)}</h2>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Libre</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((a) => {
                    const overdue = a.status === "pending" && new Date(a.due_at!) < new Date();
                    const href = a.opportunity_id ? `/oportunidades/${a.opportunity_id}` : a.institution_id ? `/instituciones/${a.institution_id}` : "/mi-dia";
                    return (
                      <li key={a.id} className={`rounded-md border-l-[3px] bg-muted/60 p-2 text-xs ${overdue ? "border-l-red-500" : a.status === "done" ? "border-l-teal-500" : "border-l-sky-400"}`}>
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold tabular-nums">{time(a.due_at!)}</span>
                          <span className="text-muted-foreground">{activityTypes[a.activity_type as keyof typeof activityTypes]}</span>
                          {a.status === "done" && <Pill tone="teal">Hecha</Pill>}
                          {overdue && <Pill tone="red">Vencida</Pill>}
                        </p>
                        <Link href={href} className={`mt-0.5 block font-medium hover:underline ${a.status === "done" ? "text-muted-foreground line-through" : ""}`}>{a.subject}</Link>
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
      {rows.length === 0 && !error && (
        <p className="text-center text-sm text-muted-foreground md:hidden">Semana libre. Programa actividades desde la ficha de una institución u oportunidad.</p>
      )}
      <p className="text-xs text-muted-foreground">Las actividades sin fecha no aparecen aquí; están en <Link href="/mi-dia" className="underline">Mi día</Link>, en “Sin fecha”.</p>
    </div>
  );
}
