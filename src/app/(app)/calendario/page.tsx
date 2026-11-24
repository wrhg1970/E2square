import Link from "next/link";
import { cookies, headers } from "next/headers";
import { userAgent } from "next/server";
import { SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, type ActivityRow } from "@/modules/activities/activity-panel";
import { activityTypes } from "@/modules/activities/labels";
import { addDays, calendarDays, calendarViews, dayIn, stepCalendar, zonedToUtc, type CalendarView } from "@/modules/activities/time";
import { RememberView } from "@/modules/activities/remember-view";
import { buttonVariants } from "@/components/ui/button";
import { AutoForm } from "@/components/ui/auto-form";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isView = (v: unknown): v is CalendarView => typeof v === "string" && v in calendarViews;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", ...o }).format(new Date(`${d}T12:00:00Z`));
const navNames = { dia: "Día", semana: "Semana", mes: "Mes" } as const;

// Calendario interno: actividades (pendientes y hechas) de un vendedor por día, semana o mes. RLS limita a quién puedes ver.
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
  // Vista: la del enlace, si no la última que usaste, si no Día en celular y Semana en computadora. ?semana= es el enlace anterior.
  const saved = (await cookies()).get("cal_vista")?.value;
  const view: CalendarView = isView(sp.vista) ? sp.vista : isDate(sp.semana) ? "semana" : isView(saved) ? saved
    : userAgent({ headers: await headers() }).device.type === "mobile" ? "dia" : "semana";
  const focus = isDate(sp.fecha) ? sp.fecha : isDate(sp.semana) ? sp.semana : today;
  const days = calendarDays(view, focus);
  const start = days[0];
  const end = days.at(-1)!;
  const owner = uuid(sp.vendedor) ?? me.id;

  const from = zonedToUtc(`${start}T00:00`, tz).toISOString();
  const to = zonedToUtc(`${addDays(end, 1)}T00:00`, tz).toISOString();
  const { data, error } = await supabase
    .from("activities")
    .select(ACTIVITY_COLUMNS)
    .eq("owner_id", owner)
    .neq("status", "cancelled")
    .gte("due_at", from)
    .lt("due_at", to)
    .order("due_at")
    .limit(1000);
  const rows = (data ?? []) as ActivityRow[];
  const instIds = [...new Set(rows.map((a) => a.institution_id).filter(Boolean))] as string[];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));
  const time = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  const hourLabel = (h: number) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(Date.UTC(2000, 0, 1, h));
  const dayLabel = (d: string) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
  const byDay = new Map<string, ActivityRow[]>();
  for (const a of rows) {
    const d = dayIn(new Date(a.due_at!), tz);
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  const now = new Date();
  const isOverdue = (a: ActivityRow) => a.status === "pending" && new Date(a.due_at!) < now;
  const pending = rows.filter((a) => a.status === "pending");
  const overdueCount = pending.filter(isOverdue).length;
  const qs = (vista: CalendarView, fecha: string) => `/calendario?${new URLSearchParams({ vista, fecha, ...(owner !== me.id && { vendedor: owner }) })}`;
  const month = focus.slice(0, 7);
  const title = view === "dia" ? fmt(focus, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : view === "semana" ? `Semana del ${dayLabel(start)} al ${dayLabel(end)}`
    : fmt(`${month}-01`, { month: "long", year: "numeric" });

  const item = (a: ActivityRow, compact = false) => {
    const overdue = isOverdue(a);
    const href = a.opportunity_id ? `/oportunidades/${a.opportunity_id}` : a.institution_id ? `/instituciones/${a.institution_id}` : "/mi-dia";
    const border = overdue ? "border-l-red-500" : a.status === "done" ? "border-l-teal-500" : "border-l-sky-400";
    if (compact)
      return (
        <li key={a.id} className={`truncate rounded border-l-2 bg-muted/60 px-1.5 py-0.5 ${border}`}>
          <Link href={href} title={a.subject} className={`hover:underline ${a.status === "done" ? "text-muted-foreground line-through" : ""}`}>
            <span className="tabular-nums text-muted-foreground">{time(a.due_at!)}</span> {a.subject}
          </Link>
        </li>
      );
    return (
      <li key={a.id} className={`rounded-md border-l-[3px] bg-muted/60 p-2 text-xs ${border}`}>
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
  };

  // Vista Día: agenda por hora, de 7 a 20 h, más cualquier hora fuera de ese rango que tenga actividades.
  const dayItems = byDay.get(focus) ?? [];
  const usedHours = dayItems.map((a) => hourOf(a.due_at!));
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => (h >= 7 && h <= 20) || usedHours.includes(h));

  return (
    <div className="space-y-6">
      <RememberView view={view} />
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">
            <span className="first-letter:uppercase inline-block">{title}</span> · {rows.length} {rows.length === 1 ? "actividad" : "actividades"} · {pending.length} pendientes
            {overdueCount > 0 && <> · <b className="text-amber-300">{overdueCount} vencidas</b></>}
          </p>
        </div>
        <nav aria-label={navNames[view]} className="flex gap-1 text-sm">
          <Link href={qs(view, stepCalendar(view, focus, -1))} className={buttonVariants({ variant: "outline" })} aria-label={`${navNames[view]} anterior`}>←</Link>
          <Link href={qs(view, today)} className={buttonVariants({ variant: "outline" })}>Hoy</Link>
          <Link href={qs(view, stepCalendar(view, focus, 1))} className={buttonVariants({ variant: "outline" })} aria-label={`${navNames[view]} siguiente`}>→</Link>
        </nav>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Segmented label="Vista del calendario"
          items={(Object.keys(calendarViews) as CalendarView[]).map((v) => ({ href: qs(v, focus), label: calendarViews[v], current: v === view }))} />
        {(people ?? []).length > 1 && (
          <AutoForm className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="vista" value={view} />
            <input type="hidden" name="fecha" value={focus} />
            <SelectField label="Ver el calendario de" name="vendedor" defaultValue={owner} className="w-full sm:w-64"
              options={(people ?? []).map((p) => ({ value: p.id, label: p.id === me.id ? "Yo" : p.full_name || p.email }))} />
            <noscript><button type="submit" className={buttonVariants({ variant: "outline" })}>Ver</button></noscript>
          </AutoForm>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-700">No se pudo cargar el calendario. Recarga la página.</p>}

      {view === "dia" && (
        <section aria-label={dayLabel(focus)} className={`rounded-xl border bg-background shadow-sm ${focus === today ? "border-primary ring-1 ring-primary" : "border-border"}`}>
          <ol>
            {hours.map((h) => {
              const items = dayItems.filter((a) => hourOf(a.due_at!) === h);
              return (
                <li key={h} className="flex gap-3 border-b border-border px-3 py-2 last:border-b-0">
                  <span className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{hourLabel(h)}</span>
                  {items.length > 0 ? <ul className="min-w-0 flex-1 space-y-2">{items.map((a) => item(a))}</ul> : <span className="min-h-5 flex-1" />}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {view === "semana" && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            return (
              <section key={d} aria-label={dayLabel(d)} className={`space-y-2 rounded-xl border bg-background p-3 shadow-sm md:min-h-40 ${d === today ? "border-primary ring-1 ring-primary" : "border-border"} ${items.length === 0 && d !== today ? "max-md:hidden" : ""}`}>
                <h2 className="text-sm first-letter:uppercase">
                  <Link href={qs("dia", d)} className={`hover:underline ${d === today ? "font-semibold" : "text-muted-foreground"}`}>{dayLabel(d)}</Link>
                </h2>
                {items.length === 0 ? <p className="text-xs text-muted-foreground">Libre</p> : <ul className="space-y-2">{items.map((a) => item(a))}</ul>}
              </section>
            );
          })}
        </div>
      )}

      {view === "mes" && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-medium text-muted-foreground" aria-hidden>
            {days.slice(0, 7).map((d) => <span key={d} className="py-2 first-letter:uppercase">{fmt(d, { weekday: "short" })}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              const inMonth = d.startsWith(month);
              const late = items.some(isOverdue);
              return (
                <section key={d} aria-label={dayLabel(d)} className={`min-h-16 border-b border-r border-border p-1 text-xs md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-muted/30 text-muted-foreground"}`}>
                  <Link href={qs("dia", d)} aria-label={`Ver el ${dayLabel(d)}${items.length ? `, ${items.length} ${items.length === 1 ? "actividad" : "actividades"}` : ""}`}
                    className={`inline-flex size-6 items-center justify-center rounded-full tabular-nums hover:bg-muted ${d === today ? "bg-primary font-semibold text-primary-foreground hover:bg-primary" : ""}`}>
                    {Number(d.slice(8))}
                  </Link>
                  {items.length > 0 && (
                    <>
                      {/* En celular solo un indicador con el número; se toca el día para verlo. */}
                      <p className={`mt-1 md:hidden ${late ? "text-red-400" : "text-teal-400"}`} aria-hidden>● {items.length}</p>
                      <ul className="mt-1 hidden space-y-1 md:block">{items.slice(0, 3).map((a) => item(a, true))}</ul>
                      {items.length > 3 && <Link href={qs("dia", d)} className="mt-1 hidden text-muted-foreground hover:underline md:block">+{items.length - 3} más</Link>}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {rows.length === 0 && !error && (
        <p className={`text-center text-sm text-muted-foreground ${view === "semana" ? "md:hidden" : ""}`}>
          {view === "dia" ? "Día libre." : view === "semana" ? "Semana libre." : "Mes libre."} Programa actividades desde la ficha de una institución u oportunidad.
        </p>
      )}
      <p className="text-xs text-muted-foreground">Las actividades sin fecha no aparecen aquí; están en <Link href="/mi-dia" className="underline">Mi día</Link>, en “Sin fecha”.</p>
    </div>
  );
}
