import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { createProduct } from "@/modules/catalog/actions";
import { CURRENCIES, revenueModels } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";

export default async function ProductsPage() {
  const supabase = await createClient();
  const [{ data: products, error }, { data: canManage }] = await Promise.all([
    supabase.from("products").select("id, code, name, category, revenue_model, default_currency, active").order("name"),
    supabase.rpc("has_permission", { permission: "catalog.manage" }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
      {error ? (
        <p role="alert" className="text-sm text-red-700">No se pudo cargar el catálogo. Recarga la página.</p>
      ) : !products?.length ? (
        <p className="text-sm text-muted-foreground">Todavía no hay productos.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/productos/${p.id}`} className="block rounded-xl border border-border p-4 hover:bg-muted">
                <p className="text-xs text-muted-foreground">{p.code}{p.active ? "" : " · Inactivo"}</p>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {revenueModels[p.revenue_model as keyof typeof revenueModels]} · {p.default_currency}{p.category ? ` · ${p.category}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">Agregar producto</summary>
          <ActionForm action={createProduct} submitLabel="Crear producto" className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Clave" name="code" placeholder="TOEFL" required />
            <Field label="Nombre" name="name" required />
            <Field label="Categoría" name="category" />
            <SelectField label="Modelo de ingreso" name="revenue_model" options={toOptions(revenueModels)} />
            <SelectField label="Moneda" name="default_currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <input type="hidden" name="active" value="on" />
          </ActionForm>
          <p className="mt-2 text-xs text-muted-foreground">Se crea con un pipeline estándar de 6 etapas que puedes ajustar.</p>
        </details>
      )}
    </div>
  );
}
