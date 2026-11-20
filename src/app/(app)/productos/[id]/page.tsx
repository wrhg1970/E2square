import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addPriceItem, addStage, updateProduct, updateStage } from "@/modules/catalog/actions";
import { CURRENCIES, revenueModels, stageRequirements } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";
import { formatMoney } from "@/modules/opportunities/labels";
import { formatDay } from "@/modules/activities/time";

function StageFields({ stage }: { stage?: { name: string; default_probability: number; sla_days: number | null; required_fields: string[]; is_won: boolean; is_lost: boolean } }) {
  return (
    <>
      <Field label="Etapa" name="name" defaultValue={stage?.name} required />
      <Field label="Probabilidad %" name="default_probability" type="number" min={0} max={100} defaultValue={stage?.default_probability ?? 50} required />
      <Field label="SLA (días)" name="sla_days" type="number" min={1} defaultValue={stage?.sla_days ?? ""} />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:col-span-3">
        <legend className="sr-only">Requisitos para entrar</legend>
        {Object.entries(stageRequirements).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" name="required_fields" value={k} defaultChecked={stage?.required_fields.includes(k)} /> {label}
          </label>
        ))}
        <label className="flex items-center gap-1.5"><input type="checkbox" name="is_won" defaultChecked={stage?.is_won} /> Es ganada</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="is_lost" defaultChecked={stage?.is_lost} /> Es perdida</label>
      </fieldset>
    </>
  );
}

export default async function ProductPage({ params }: PageProps<"/productos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();
  const [prices, stages, { data: canManage }] = await Promise.all([
    supabase.from("price_list_items").select("*").eq("product_id", id).order("valid_from", { ascending: false }),
    product.default_pipeline_id
      ? supabase.from("pipeline_stages").select("*").eq("pipeline_id", product.default_pipeline_id).order("sort_order")
      : Promise.resolve({ data: [] as never[] }),
    supabase.rpc("has_permission", { permission: "catalog.manage" }),
  ]);

  return (
    <div className="max-w-5xl space-y-8">
      <div className="on-band page-header space-y-1">
        <Link href="/productos" className="text-sm text-muted-foreground underline">Productos</Link>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="text-sm text-muted-foreground">{product.code} · {revenueModels[product.revenue_model as keyof typeof revenueModels]} · {product.default_currency}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lista de precios</h2>
        {!prices.data?.length ? (
          <p className="text-sm text-muted-foreground">Sin precios. Las oportunidades podrán capturar precio manual.</p>
        ) : (
          <div className="table-card"><table className="w-full text-left text-sm">
            <thead className="text-muted-foreground"><tr>{["Concepto", "Unidad", "Precio", "Costo", "Vigente desde"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {prices.data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2 pr-4">{p.name}</td>
                  <td className="py-2 pr-4">{p.unit_name}</td>
                  <td className="py-2 pr-4">{formatMoney(p.unit_price, p.currency_code)}</td>
                  <td className="py-2 pr-4">{formatMoney(p.unit_cost, p.currency_code)}</td>
                  <td className="py-2 pr-4">{p.valid_from ? formatDay(p.valid_from) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {canManage && (
          <ActionForm action={addPriceItem.bind(null, id)} submitLabel="Agregar precio" className="grid gap-3 sm:grid-cols-6 sm:items-end">
            <Field label="Concepto" name="name" placeholder="Licencia anual" required className="sm:col-span-2" />
            <Field label="Unidad" name="unit_name" defaultValue="alumno" />
            <SelectField label="Moneda" name="currency_code" defaultValue={product.default_currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <Field label="Precio" name="unit_price" type="number" step="0.01" min={0} required />
            <Field label="Costo" name="unit_cost" type="number" step="0.01" min={0} />
          </ActionForm>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pipeline</h2>
        <ol className="space-y-3">
          {(stages.data ?? []).map((s, i) => (
            <li key={s.id} className="rounded-xl border border-border bg-background shadow-sm p-4">
              {canManage ? (
                <ActionForm action={updateStage.bind(null, s.id, id)} submitLabel="Guardar" className="grid gap-3 sm:grid-cols-4 sm:items-end">
                  <StageFields stage={s} />
                </ActionForm>
              ) : (
                <p className="text-sm">
                  <strong>{i + 1}. {s.name}</strong> · {s.default_probability}%{s.sla_days ? ` · SLA ${s.sla_days} días` : ""}
                  {s.required_fields.length > 0 && ` · Requiere: ${s.required_fields.map((r: string) => stageRequirements[r as keyof typeof stageRequirements]).join(", ")}`}
                </p>
              )}
            </li>
          ))}
        </ol>
        {canManage && product.default_pipeline_id && (
          <details className="rounded-xl border border-border bg-background shadow-sm p-4">
            <summary className="cursor-pointer text-sm font-medium">Agregar etapa</summary>
            <ActionForm action={addStage.bind(null, product.default_pipeline_id, id)} submitLabel="Agregar etapa" className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
              <StageFields />
            </ActionForm>
          </details>
        )}
      </section>

      {canManage && (
        <details className="rounded-xl border border-border bg-background shadow-sm p-4">
          <summary className="cursor-pointer text-sm font-medium">Editar producto</summary>
          <ActionForm action={updateProduct.bind(null, id)} submitLabel="Guardar producto" className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Clave" name="code" defaultValue={product.code} required />
            <Field label="Nombre" name="name" defaultValue={product.name} required />
            <Field label="Categoría" name="category" defaultValue={product.category ?? ""} />
            <SelectField label="Modelo de ingreso" name="revenue_model" defaultValue={product.revenue_model} options={toOptions(revenueModels)} />
            <SelectField label="Moneda" name="default_currency" defaultValue={product.default_currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={product.active} /> Activo</label>
            <TextareaField label="Descripción" name="description" defaultValue={product.description ?? ""} className="sm:col-span-3" />
          </ActionForm>
        </details>
      )}
    </div>
  );
}
