import { ActionForm } from "@/components/ui/action-form";
import { Bars } from "@/components/ui/bars";
import { AutoForm } from "@/components/ui/auto-form";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/action-state";
import { dayIn, formatDay } from "@/modules/activities/time";
import { aiEnv } from "@/modules/ai/config";
import { askQuestion } from "@/modules/insights/actions";
import { moneyQueryMetrics, queryGroups, queryMetrics, querySpec, quickRanges } from "@/modules/insights/spec";
import { formatMoney } from "@/modules/opportunities/labels";

const options = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

export default async function QueriesPage({ searchParams }: PageProps<"/consultas">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = dayIn(new Date(), "America/Mexico_City");
  const spec = querySpec.safeParse({
    metric: one("metric") ?? "won_amount", group: one("group") ?? "month", from: one("from") ?? `${today.slice(0, 4)}-01-01`, to: one("to") ?? today,
  });
  const question = one("pregunta");
  const supabase = await createClient();
  const [result, { data: org }] = await Promise.all([
    spec.success
      ? supabase.rpc("query_metric", { p_metric: spec.data.metric, p_group: spec.data.group, p_from: spec.data.from, p_to: spec.data.to })
      : Promise.resolve({ data: null, error: null }),
    supabase.from("organizations").select("reporting_currency").maybeSingle(),
  ]);
  const rows = (result.data ?? []) as { label: string; value: number; unconverted: number }[];
  const isMoney = spec.success && (moneyQueryMetrics as readonly string[]).includes(spec.data.metric);
  const fmt = (v: number) => (isMoney ? formatMoney(v, org?.reporting_currency ?? "USD") : Number(v).toLocaleString("es-MX"));
  const unconverted = rows.reduce((n, r) => n + Number(r.unconverted), 0);
  const values = spec.success ? spec.data : { metric: "won_amount", group: "month", from: "", to: "" };
  const total = rows.reduce((n, r) => n + Number(r.value), 0);
  const top = [...rows].sort((a, b) => Number(b.value) - Number(a.value))[0];
  const href = (p: Partial<typeof values>) => `/consultas?${new URLSearchParams({ ...values, ...p })}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="on-band page-header space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consultas</h1>
          <p className="text-sm text-muted-foreground">Pregunta por venta, margen, unidades o pipeline. Solo ves lo que tus permisos te dejan ver.</p>
        </div>
        {aiEnv() ? (
          <div className="on-light rounded-xl bg-background p-4 shadow-sm">
            <ActionForm action={askQuestion} submitLabel="Preguntar" className="flex flex-wrap items-end gap-3">
              <Field label="Pregunta en tus palabras" name="question" placeholder="¿Cuánto vendimos en octubre por proveedor?" defaultValue={question} maxLength={500} required className="min-w-0 flex-1 basis-72" />
            </ActionForm>
            <p className="mt-2 text-xs text-muted-foreground">La IA solo elige qué medir, cómo agrupar y el periodo; los datos los calcula el sistema con tus permisos. Revisa abajo lo que entendió.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Las preguntas en lenguaje natural se activan cuando el administrador configure la IA. Mientras, elige abajo qué ver.</p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
        <AutoForm className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
          <SelectField label="Qué medir" name="metric" options={options(queryMetrics)} defaultValue={values.metric} />
          <SelectField label="Agrupar por" name="group" options={options(queryGroups)} defaultValue={values.group} />
          <Field label="Desde" name="from" type="date" defaultValue={values.from} required />
          <Field label="Hasta" name="to" type="date" defaultValue={values.to} required />
          <noscript><button type="submit" className="h-9 rounded-md border border-border px-4 text-sm">Consultar</button></noscript>
        </AutoForm>
        <Segmented label="Periodo rápido" items={quickRanges(today).map((r) => ({
          href: href({ from: r.from, to: r.to }), label: r.label, current: values.from === r.from && values.to === r.to,
        }))} />
      </div>

      <section aria-live="polite" className="space-y-3">
        {!spec.success ? (
          <p role="alert" className="text-sm text-red-700">{spec.error.issues[0].message}</p>
        ) : result.error ? (
          <p role="alert" className="text-sm text-red-700">{dbErrorMessage(result.error)}</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              {queryMetrics[spec.data.metric]}{spec.data.group !== "total" && ` por ${queryGroups[spec.data.group].toLowerCase()}`}
              <span className="text-sm font-normal text-muted-foreground"> · {formatDay(spec.data.from)} a {formatDay(spec.data.to)}</span>
            </h2>
            {question && <p className="text-sm text-muted-foreground">Pregunta: &ldquo;{question}&rdquo;</p>}
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center text-sm">
                <p className="font-medium">No hay datos para ese periodo.</p>
                <p className="mt-1 text-muted-foreground">Prueba con «Este año» o «Año pasado», o cambia qué medir. Solo cuentan las oportunidades ganadas (o abiertas, para el pipeline).</p>
              </div>
            ) : (
              <>
              {spec.data.group !== "total" && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <StatTile label="Total" value={fmt(total)} />
                  <StatTile label={`Mayor ${queryGroups[spec.data.group].toLowerCase()}`} value={top ? fmt(Number(top.value)) : "—"} hint={top?.label} />
                  <StatTile label="Grupos con datos" value={rows.length} />
                </div>
              )}
              <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
              <Bars label={queryMetrics[spec.data.metric]} rows={rows.map((r) => ({ key: r.label, name: r.label, value: Number(r.value), text: fmt(Number(r.value)) }))} />
              </div>
              </>
            )}
            {unconverted > 0 && <p className="text-sm text-amber-700">{unconverted} oportunidades en otra moneda no tienen tipo de cambio y no se suman.</p>}
          </>
        )}
      </section>
    </div>
  );
}
