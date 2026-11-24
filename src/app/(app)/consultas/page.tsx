import { ActionForm } from "@/components/ui/action-form";
import { Bars } from "@/components/ui/bars";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/action-state";
import { dayIn, formatDay } from "@/modules/activities/time";
import { aiEnv } from "@/modules/ai/config";
import { askQuestion } from "@/modules/insights/actions";
import { moneyQueryMetrics, queryGroups, queryMetrics, querySpec } from "@/modules/insights/spec";
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

  return (
    <div className="max-w-4xl space-y-6">
      <div className="on-band page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Consultas</h1>
        <p className="text-sm text-muted-foreground">Pregunta por venta, margen, unidades o pipeline. Solo ves lo que tus permisos te dejan ver.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pregunta en tus palabras</h2>
        {aiEnv() ? (
          <ActionForm action={askQuestion} submitLabel="Preguntar" className="flex flex-wrap items-end gap-3">
            <Field label="Pregunta" name="question" placeholder="¿Cuánto vendimos en octubre por proveedor?" defaultValue={question} maxLength={500} required className="min-w-72 flex-1" />
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">Las preguntas en lenguaje natural se activan cuando el administrador configure la IA. Mientras, usa el formulario.</p>
        )}
        <p className="text-xs text-muted-foreground">La IA solo elige qué medir, cómo agrupar y el periodo; los datos los calcula el sistema con tus permisos. Revisa abajo lo que entendió.</p>
      </section>

      <form className="grid gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:grid-cols-5 sm:items-end">
        <SelectField label="Qué medir" name="metric" options={options(queryMetrics)} defaultValue={values.metric} />
        <SelectField label="Agrupar por" name="group" options={options(queryGroups)} defaultValue={values.group} />
        <Field label="Desde" name="from" type="date" defaultValue={values.from} required />
        <Field label="Hasta" name="to" type="date" defaultValue={values.to} required />
        <Button type="submit">Consultar</Button>
      </form>

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
              <p className="text-sm text-muted-foreground">No hay datos para ese periodo.</p>
            ) : (
              <Bars label={queryMetrics[spec.data.metric]} rows={rows.map((r) => ({ key: r.label, name: r.label, value: Number(r.value), text: fmt(Number(r.value)) }))} />
            )}
            {unconverted > 0 && <p className="text-sm text-amber-700">{unconverted} oportunidades en otra moneda no tienen tipo de cambio y no se suman.</p>}
          </>
        )}
      </section>
    </div>
  );
}
