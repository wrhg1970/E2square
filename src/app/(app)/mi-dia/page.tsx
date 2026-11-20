import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_COLUMNS, ActivityItem, NewActivityForm, type ActivityRow } from "@/modules/activities/activity-panel";
import { dayIn } from "@/modules/activities/time";
import { formatMoney } from "@/modules/opportunities/labels";

function Block({ title, count, children, tone }: { title: string; count: number; children: ReactNode; tone?: "alert" }) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-background shadow-sm p-5">
      <h2 className={`font-semibold ${tone === "alert" && count ? "text-red-700" : ""}`}>{title} ({count})</h2>
      {count === 0 ? <p className="text-sm text-muted-foreground">Nada por aquí.</p> : children}
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

  const [pending, doneToday, idleOpps] = await Promise.all([
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("owner_id", me.id).eq("status", "pending").or(`due_at.lte.${weekAhead},due_at.is.null`).order("due_at", { nullsFirst: false }).limit(200),
    supabase.from("activities").select(ACTIVITY_COLUMNS).eq("owner_id", me.id).eq("status", "done").gte("completed_at", dayStart).order("completed_at", { ascending: false }),
    supabase.from("opportunities").select("id, name, institution_id, amount, currency_code").eq("owner_id", me.id).eq("status", "open").is("next_activity_at", null).order("amount", { ascending: false }).limit(50),
  ]);
  const rows = (pending.data ?? []) as ActivityRow[];
  const overdue = rows.filter((a) => a.due_at && new Date(a.due_at) < now && dayIn(new Date(a.due_at), tz) < today);
  const todays = rows.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) === today);
  const upcoming = rows.filter((a) => a.due_at && dayIn(new Date(a.due_at), tz) > today);
  const undated = rows.filter((a) => !a.due_at);
  const completed = ((doneToday.data ?? []) as ActivityRow[]).filter((a) => a.completed_at && dayIn(new Date(a.completed_at), tz) === today);

  const instIds = [...new Set([...rows, ...completed].map((a) => a.institution_id).concat((idleOpps.data ?? []).map((o) => o.institution_id)).filter(Boolean))] as string[];
  const { data: insts } = instIds.length ? await supabase.from("institutions").select("id, name").in("id", instIds) : { data: [] };
  const instName = new Map((insts ?? []).map((i) => [i.id, i.name]));
  const people = new Map([[me.id, "Yo"]]);
  const where = (a: ActivityRow) =>
    a.institution_id ? <> · <Link href={a.opportunity_id ? `/oportunidades/${a.opportunity_id}` : `/instituciones/${a.institution_id}`} className="underline">{instName.get(a.institution_id)}</Link></> : null;
  const list = (items: ActivityRow[]) => (
    <ul className="divide-y divide-border">{items.map((a) => <ActivityItem key={a.id} a={a} timeZone={tz} people={people} canAct context={where(a)} />)}</ul>
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Mi día</h1>
        <p className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat("es-MX", { timeZone: tz, dateStyle: "full" }).format(now)} · {todays.length} para hoy · {overdue.length} vencidas
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Vencidas" count={overdue.length} tone="alert">{list(overdue)}</Block>
        <Block title="Hoy" count={todays.length}>{list(todays)}</Block>
        <Block title="Oportunidades sin próxima actividad" count={idleOpps.data?.length ?? 0} tone="alert">
          <ul className="divide-y divide-border text-sm">
            {(idleOpps.data ?? []).map((o) => (
              <li key={o.id} className="flex justify-between gap-2 py-2">
                <Link href={`/oportunidades/${o.id}`} className="font-medium underline">{o.name}</Link>
                <span className="text-muted-foreground">{instName.get(o.institution_id)} · {formatMoney(o.amount, o.currency_code)}</span>
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Próximos 7 días" count={upcoming.length}>{list(upcoming)}</Block>
        <Block title="Sin fecha" count={undated.length}>{list(undated)}</Block>
        <Block title="Completadas hoy" count={completed.length}>{list(completed)}</Block>
      </div>

      <details className="rounded-xl border border-border bg-background shadow-sm p-5">
        <summary className="cursor-pointer font-semibold">Tarea interna o actividad sin institución</summary>
        <div className="mt-3"><NewActivityForm /></div>
      </details>
    </div>
  );
}
