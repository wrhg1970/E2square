import { Search } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { createProduct } from "@/modules/catalog/actions";
import { CURRENCIES, revenueModels } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";

export default async function SuppliersPage({ searchParams }: PageProps<"/productos">) {
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim().toLowerCase().slice(0, 100) : "";
  const supabase = await createClient();
  const [{ data: rows, error }, { data: canManage }, { data: open }] = await Promise.all([
    supabase.from("products").select("id, code, name, revenue_model, default_currency, active, supplier_id, default_pipeline_id").order("name"),
    supabase.rpc("has_permission", { permission: "catalog.manage" }),
    supabase.from("opportunities").select("pipeline_id").eq("status", "open"),
  ]);

  const all = rows ?? [];
  const productsOf = (id: string) => all.filter((p) => p.supplier_id === id);
  const openCount = (pipeline: string | null) => (open ?? []).filter((o) => o.pipeline_id === pipeline).length;
  // Busca por proveedor o por cualquiera de sus productos.
  const suppliers = all
    .filter((s) => !s.supplier_id)
    .filter((s) => !q || [s, ...productsOf(s.id)].some((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="on-band page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
          <p className="text-sm opacity-80">
            {all.filter((s) => !s.supplier_id).length} proveedores · {all.filter((p) => p.supplier_id).length} productos
          </p>
        </div>
        <form role="search" className="relative w-full sm:w-72">
          <label htmlFor="q" className="sr-only">Buscar proveedor o producto</label>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <input id="q" name="q" defaultValue={q} placeholder="Buscar proveedor o producto"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground" />
        </form>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudo cargar el catálogo. Recarga la página.</p>
      ) : !suppliers.length ? (
        <p className="text-sm text-muted-foreground">{q ? "Ningún proveedor o producto coincide con la búsqueda." : "Todavía no hay proveedores."}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => {
            const products = productsOf(s.id);
            const opps = openCount(s.default_pipeline_id);
            return (
              <li key={s.id} className="flex flex-col rounded-xl border border-border bg-background p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground">{s.code}</p>
                    <Link href={`/productos/${s.id}`} className="text-lg font-semibold hover:underline">{s.name}</Link>
                  </div>
                  {!s.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Inactivo</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {revenueModels[s.revenue_model as keyof typeof revenueModels]} · {s.default_currency} · {opps} {opps === 1 ? "oportunidad abierta" : "oportunidades abiertas"}
                </p>
                <div className="mt-4 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {products.length === 1 ? "1 producto" : `${products.length} productos`}
                  </p>
                  {products.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {products.slice(0, 8).map((p) => (
                        <li key={p.id}>
                          <Link href={`/productos/${p.id}`} className={`inline-block rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted ${p.active ? "" : "opacity-60 line-through"}`}>{p.name}</Link>
                        </li>
                      ))}
                      {products.length > 8 && <li className="px-1 text-xs text-muted-foreground">+{products.length - 8} más</li>}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Sin productos capturados.</p>
                  )}
                </div>
                <Link href={`/productos/${s.id}`} className="mt-4 self-start text-sm font-medium underline-offset-2 hover:underline">
                  {canManage ? "Ver y editar" : "Ver detalle"} →
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <details className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium">Agregar proveedor</summary>
          <ActionForm action={createProduct} submitLabel="Crear proveedor" className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Clave" name="code" placeholder="ETS" required />
            <Field label="Nombre" name="name" required />
            <SelectField label="Modelo de ingreso" name="revenue_model" options={toOptions(revenueModels)} />
            <SelectField label="Moneda" name="default_currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <input type="hidden" name="active" value="on" />
          </ActionForm>
          <p className="mt-2 text-xs text-muted-foreground">Se crea con un pipeline estándar de 6 etapas que puedes ajustar. Sus productos se agregan dentro del proveedor.</p>
        </details>
      )}
    </div>
  );
}
