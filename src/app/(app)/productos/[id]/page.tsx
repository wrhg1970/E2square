import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { addPriceItem, addStage, createProduct, updateProduct, updateStage } from "@/modules/catalog/actions";
import { CURRENCIES, revenueModels, stageRequirements } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";
import { formatMoney } from "@/modules/opportunities/labels";
import { formatDay } from "@/modules/activities/time";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { buttonVariants } from "@/components/ui/button";

type Stage = { id: string; name: string; default_probability: number; sla_days: number | null; required_fields: string[]; is_won: boolean; is_lost: boolean };

const checkbox = "size-4 accent-[var(--primary)]";

function StageFields({ stage }: { stage?: Stage }) {
  return (
    <>
      <Field label="Etapa" name="name" defaultValue={stage?.name} required />
      <Field label="Probabilidad %" name="default_probability" type="number" min={0} max={100} defaultValue={stage?.default_probability ?? 50} required />
      <Field label="SLA (días)" name="sla_days" type="number" min={1} defaultValue={stage?.sla_days ?? ""} />
      <fieldset className="space-y-2 text-sm sm:col-span-2">
        <legend className="mb-2 font-medium">Para entrar a esta etapa se necesita</legend>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {Object.entries(stageRequirements).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" name="required_fields" value={k} defaultChecked={stage?.required_fields.includes(k)} className={checkbox} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-2 font-medium">Cierre</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_won" defaultChecked={stage?.is_won} className={checkbox} /> Es ganada</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="is_lost" defaultChecked={stage?.is_lost} className={checkbox} /> Es perdida</label>
      </fieldset>
    </>
  );
}

const stageTone = (s: Stage) =>
  s.is_won ? "border-primary/60 bg-primary/10" : s.is_lost ? "border-red-300 bg-red-50" : "border-border bg-background";

// Fila de una etapa: resumen legible; quien administra la abre para editar.
function StageSummary({ stage, n }: { stage: Stage; n: number }) {
  return (
    <div className="grid grid-cols-[2rem_1fr] items-center gap-x-3 gap-y-2 sm:grid-cols-[2rem_minmax(0,1.2fr)_minmax(8rem,1fr)_5.5rem_minmax(0,1.6fr)]">
      <span aria-hidden className={`flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${stageTone(stage)}`}>{n}</span>
      <span className="font-medium">
        {stage.name}
        {stage.is_won && stage.name.toLowerCase() !== "ganada" && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-teal-800">Ganada</span>}
        {stage.is_lost && stage.name.toLowerCase() !== "perdida" && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Perdida</span>}
      </span>
      <span className="col-start-2 flex items-center gap-2 sm:col-start-auto">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${stage.default_probability}%` }} />
        </span>
        <span className="w-10 text-right text-sm tabular-nums">{stage.default_probability}%</span>
      </span>
      <span className="col-start-2 text-sm text-muted-foreground sm:col-start-auto">{stage.sla_days ? `SLA ${stage.sla_days} días` : "Sin SLA"}</span>
      <span className="col-start-2 flex flex-wrap gap-1 sm:col-start-auto">
        {stage.required_fields.length ? stage.required_fields.map((r) => (
          <span key={r} className="rounded-md bg-muted px-2 py-0.5 text-xs">{stageRequirements[r as keyof typeof stageRequirements]}</span>
        )) : <span className="text-xs text-muted-foreground">Sin requisitos</span>}
      </span>
    </div>
  );
}

type Price = { id: string; product_id: string; name: string; unit_name: string; unit_price: number; unit_cost: number; currency_code: string; valid_from: string };

function PriceTable({ prices }: { prices: Price[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground"><tr>{["Concepto", "Unidad", "Precio", "Costo", "Margen", "Vigente desde"].map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {prices.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="py-2 pr-4">{p.name}</td>
              <td className="py-2 pr-4">{p.unit_name}</td>
              <td className="py-2 pr-4 tabular-nums">{formatMoney(p.unit_price, p.currency_code)}</td>
              <td className="py-2 pr-4 tabular-nums">{formatMoney(p.unit_cost, p.currency_code)}</td>
              <td className="py-2 pr-4 tabular-nums">{Number(p.unit_price) > 0 ? `${Math.round((1 - Number(p.unit_cost) / Number(p.unit_price)) * 100)}%` : "—"}</td>
              <td className="py-2 pr-4">{p.valid_from ? formatDay(p.valid_from) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceForm({ productId, currency }: { productId: string; currency: string }) {
  return (
    <ActionForm action={addPriceItem.bind(null, productId)} submitLabel="Agregar precio" className="grid gap-3 sm:grid-cols-6 sm:items-end">
      <Field label="Concepto" name="name" placeholder="Licencia anual" required className="sm:col-span-2" />
      <Field label="Unidad" name="unit_name" defaultValue="alumno" />
      <SelectField label="Moneda" name="currency_code" defaultValue={currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      <Field label="Precio" name="unit_price" type="number" step="0.01" min={0} required />
      <Field label="Costo" name="unit_cost" type="number" step="0.01" min={0} />
    </ActionForm>
  );
}

type Product = { id: string; code: string; name: string; category: string | null; revenue_model: string; default_currency: string; active: boolean; description: string | null };

function ProductFields({ product, isSupplier }: { product?: Product; isSupplier?: boolean }) {
  return (
    <>
      <Field label="Clave" name="code" defaultValue={product?.code} required />
      <Field label="Nombre" name="name" defaultValue={product?.name} required />
      {!isSupplier && <Field label="Categoría" name="category" defaultValue={product?.category ?? ""} />}
      <SelectField label="Modelo de ingreso" name="revenue_model" defaultValue={product?.revenue_model} options={toOptions(revenueModels)} />
      <SelectField label="Moneda" name="default_currency" defaultValue={product?.default_currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      {product ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={product.active} /> Activo</label>
      ) : (
        <input type="hidden" name="active" value="on" />
      )}
    </>
  );
}

const card = "rounded-xl border border-border bg-background p-5 shadow-sm";
const addSummary = `${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer list-none [&::-webkit-details-marker]:hidden`;

export default async function ProductPage({ params }: PageProps<"/productos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();
  const isSupplier = !product.supplier_id;

  const [{ data: children }, supplier, stages, { data: canManage }] = await Promise.all([
    isSupplier
      ? supabase.from("products").select("id, code, name, category, revenue_model, default_currency, active, description").eq("supplier_id", id).order("name")
      : Promise.resolve({ data: [] as Product[] }),
    isSupplier ? Promise.resolve({ data: null }) : supabase.from("products").select("id, name").eq("id", product.supplier_id).maybeSingle(),
    product.default_pipeline_id
      ? supabase.from("pipeline_stages").select("*").eq("pipeline_id", product.default_pipeline_id).order("sort_order")
      : Promise.resolve({ data: [] as never[] }),
    supabase.rpc("has_permission", { permission: "catalog.manage" }),
  ]);
  const products = (children ?? []) as Product[];
  const stageList = (stages.data ?? []) as Stage[];
  const { data: priceRows } = await supabase.from("price_list_items").select("*")
    .in("product_id", [id, ...products.map((c) => c.id)]).order("valid_from", { ascending: false });
  const prices = (priceRows ?? []) as Price[];
  const pricesOf = (pid: string) => prices.filter((p) => p.product_id === pid);
  const fromPrice = (pid: string) => {
    const list = pricesOf(pid);
    if (!list.length) return "Sin precio";
    const min = list.reduce((a, b) => (Number(b.unit_price) < Number(a.unit_price) ? b : a));
    return `${list.length > 1 ? "Desde " : ""}${formatMoney(min.unit_price, min.currency_code)}/${min.unit_name}`;
  };

  const pricesSection = (!isSupplier || pricesOf(id).length > 0) && (
    <section aria-labelledby="precios" className={`${card} space-y-3`}>
      <h2 id="precios" className="text-lg font-semibold">{isSupplier ? "Precios generales del proveedor" : "Lista de precios"}</h2>
      {pricesOf(id).length ? <PriceTable prices={pricesOf(id)} /> : (
        <p className="text-sm text-muted-foreground">Sin precios. Las oportunidades podrán capturar precio manual.</p>
      )}
      {canManage && <PriceForm productId={id} currency={product.default_currency} />}
    </section>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header space-y-1">
        <nav aria-label="Ruta" className="flex gap-1.5 text-sm opacity-80">
          <Link href="/productos" className="underline">Proveedores</Link>
          {supplier.data && <>/<Link href={`/productos/${supplier.data.id}`} className="underline">{supplier.data.name}</Link></>}
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
        <p className="text-sm opacity-80">
          {isSupplier ? "Proveedor" : "Producto"} · {product.code} · {revenueModels[product.revenue_model as keyof typeof revenueModels]} · {product.default_currency}
          {!product.active && " · Inactivo"}
        </p>
      </div>

      {!isSupplier && pricesSection}
      <div className={isSupplier ? "grid items-start gap-6 lg:grid-cols-3" : "contents"}>
      {isSupplier && (
        <section aria-labelledby="productos" className={`${card} space-y-4 lg:col-span-2`}>
          <div className="space-y-1">
            <h2 id="productos" className="flex items-center gap-2 text-lg font-semibold">
              Productos <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{products.length}</span>
            </h2>
            <p className="text-sm text-muted-foreground">Lo que ofrece {product.name}. Las oportunidades de este proveedor eligen entre ellos.</p>
          </div>
          {!products.length ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Sin productos todavía.{canManage ? " Agrega el primero con el formulario de abajo." : ""}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {products.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link href={`/productos/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      <span className="ml-2 text-xs text-muted-foreground">{p.code}{p.category ? ` · ${p.category}` : ""}</span>
                      {!p.active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">Inactivo</span>}
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">{fromPrice(p.id)}</span>
                  </div>
                  {canManage && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs underline">Editar</summary>
                      <ActionForm action={updateProduct.bind(null, p.id)} submitLabel="Guardar" className="mt-2 grid gap-3 sm:grid-cols-3 sm:items-end">
                        <ProductFields product={p} />
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <details className="group" open={!products.length}>
              <summary className={`${addSummary} group-open:hidden`}>+ Agregar producto</summary>
              <div className="rounded-lg bg-muted/50 p-4">
                <h3 className="mb-3 text-sm font-semibold">Nuevo producto</h3>
                <ActionForm action={createProduct} submitLabel="Agregar producto" className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-3">
                  <input type="hidden" name="supplier_id" value={id} />
                  <Field label="Clave" name="code" placeholder={`${product.code}-ITP`} required />
                  <Field label="Nombre" name="name" required />
                  <Field label="Categoría" name="category" />
                  <SelectField label="Modelo de ingreso" name="revenue_model" defaultValue={product.revenue_model} options={toOptions(revenueModels)} />
                  <SelectField label="Moneda" name="default_currency" defaultValue={product.default_currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  <input type="hidden" name="active" value="on" />
                </ActionForm>
              </div>
            </details>
          )}
        </section>
      )}

      <section aria-labelledby="documentos" className={`${card} space-y-3 ${isSupplier ? "" : "mt-6"}`}>
        <h2 id="documentos" className="text-lg font-semibold">Documentos {isSupplier ? "del proveedor" : "del producto"}</h2>
        <DocumentsPanel productId={id} canWrite={Boolean(canManage)} />
      </section>
      </div>
      {isSupplier && pricesSection}

      {isSupplier && (
        <section aria-labelledby="pipeline" className={`${card} space-y-5`}>
          <div className="space-y-1">
            <h2 id="pipeline" className="text-lg font-semibold">Pipeline de {product.name}</h2>
            <p className="text-sm text-muted-foreground">Las etapas por las que pasa una oportunidad de este proveedor, en orden.{canManage ? " Toca una etapa para editarla." : ""}</p>
          </div>
          {!stageList.length ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Este proveedor no tiene etapas todavía.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[2rem_minmax(0,1.2fr)_minmax(8rem,1fr)_5.5rem_minmax(0,1.6fr)] gap-x-3 border-b border-border px-3 pb-2 text-xs font-medium text-muted-foreground sm:grid">
                <span aria-hidden>#</span><span>Etapa</span><span>Probabilidad</span><span>SLA</span><span>Requisitos para entrar</span>
              </div>
              <ol className="-mt-3 divide-y divide-border">
                {stageList.map((s, i) => (
                  <li key={s.id}>
                    {canManage ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none rounded-lg px-3 py-3 hover:bg-muted/60 group-open:bg-muted/60 [&::-webkit-details-marker]:hidden">
                          <StageSummary stage={s} n={i + 1} />
                          <span className="sr-only">Editar etapa {s.name}</span>
                        </summary>
                        <div className="mb-3 rounded-b-lg bg-muted/60 px-3 pb-4">
                          <ActionForm action={updateStage.bind(null, s.id, id)} submitLabel={`Guardar ${s.name}`} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3 sm:items-start">
                            <StageFields stage={s} />
                          </ActionForm>
                        </div>
                      </details>
                    ) : (
                      <div className="px-3 py-3"><StageSummary stage={s} n={i + 1} /></div>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          {canManage && product.default_pipeline_id && (
            <details className="group">
              <summary className={`${addSummary} group-open:hidden`}>+ Agregar etapa</summary>
              <div className="rounded-lg bg-muted/50 p-4">
                <h3 className="mb-3 text-sm font-semibold">Nueva etapa</h3>
                <ActionForm action={addStage.bind(null, product.default_pipeline_id, id)} submitLabel="Agregar etapa" className="grid gap-4 sm:grid-cols-3 sm:items-start">
                  <StageFields />
                </ActionForm>
              </div>
            </details>
          )}
        </section>
      )}

      {canManage && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium">Editar {isSupplier ? "proveedor" : "producto"}</summary>
          <ActionForm action={updateProduct.bind(null, id)} submitLabel="Guardar" className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
            <ProductFields product={product} isSupplier={isSupplier} />
            <TextareaField label="Descripción" name="description" defaultValue={product.description ?? ""} className="sm:col-span-3" />
          </ActionForm>
        </details>
      )}
    </div>
  );
}
