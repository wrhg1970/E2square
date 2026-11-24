import { MapPin, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, SelectField } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/server";
import { createProduct } from "@/modules/catalog/actions";
import { CURRENCIES, revenueModels } from "@/modules/catalog/labels";
import { toOptions } from "@/modules/institutions/labels";
import { supplierSales } from "@/modules/catalog/sales";
import { SupplierLogo } from "@/modules/catalog/supplier-logo";
import { buttonVariants } from "@/components/ui/button";
import { totalsByCurrency } from "@/modules/opportunities/labels";

export default async function SuppliersPage({ searchParams }: PageProps<"/productos">) {
  const { q: rawQ } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim().toLowerCase().slice(0, 100) : "";
  const supabase = await createClient();
  // shortcut: trae todas las oportunidades visibles; pasar a una vista agregada si superan unos miles.
  const [{ data: rows, error }, { data: canManage }, { data: opps }, { data: primaries }] = await Promise.all([
    supabase.from("products").select("id, code, name, revenue_model, default_currency, active, supplier_id, default_pipeline_id, logo_path, city, country").order("name"),
    supabase.rpc("has_permission", { permission: "catalog.manage" }),
    supabase.from("opportunities").select("pipeline_id, status, amount, currency_code, probability, closed_at, updated_at").neq("status", "cancelled"),
    supabase.from("supplier_contacts").select("supplier_id, name, job_title").eq("is_primary", true),
  ]);

  const all = rows ?? [];
  const productsOf = (id: string) => all.filter((p) => p.supplier_id === id);
  const salesOf = (s: { default_pipeline_id: string | null; default_currency: string }) =>
    supplierSales((opps ?? []).filter((o) => o.pipeline_id === s.default_pipeline_id), s.default_currency);
  const year = new Date().getFullYear();
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
            {" · "}Vendido en {year}: {totalsByCurrency(all.filter((s) => !s.supplier_id).flatMap((s) => salesOf(s).wonYear), (o) => o.currency_code, (o) => Number(o.amount))}
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
            const sales = salesOf(s);
            const contact = primaries?.find((c) => c.supplier_id === s.id);
            const place = [s.city, s.country].filter(Boolean).join(", ");
            return (
              <li key={s.id} className="relative flex flex-col rounded-xl border border-border bg-background p-5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/40 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <SupplierLogo id={s.id} name={s.name} logoPath={s.logo_path} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground">{s.code} · {revenueModels[s.revenue_model as keyof typeof revenueModels]}</p>
                    {/* El enlace cubre toda la tarjeta. */}
                    <Link href={`/productos/${s.id}`} className="text-lg font-semibold leading-tight after:absolute after:inset-0 after:rounded-xl hover:underline">{s.name}</Link>
                  </div>
                  {!s.active && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Inactivo</span>}
                </div>

                <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-lg bg-muted/50 py-2.5 text-center">
                  <div className="px-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Vendido {year}</dt>
                    <dd className="truncate font-semibold tabular-nums">{totalsByCurrency(sales.wonYear, (o) => o.currency_code, (o) => Number(o.amount))}</dd>
                  </div>
                  <div className="px-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Pipeline</dt>
                    <dd className="truncate font-semibold tabular-nums">{totalsByCurrency(sales.open, (o) => o.currency_code, (o) => Number(o.amount))}</dd>
                  </div>
                  <div className="px-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Abiertas</dt>
                    <dd className="font-semibold tabular-nums">{sales.open.length}</dd>
                  </div>
                </dl>

                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><UserRound className="size-3.5 shrink-0 text-primary" aria-hidden />
                    {contact ? <span className="truncate text-foreground">{contact.name}{contact.job_title ? <span className="text-muted-foreground"> · {contact.job_title}</span> : null}</span> : "Sin contacto principal"}
                  </li>
                  <li className="flex items-center gap-2"><MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
                    {place ? <span className="truncate text-foreground">{place}</span> : "Sin dirección"}
                  </li>
                </ul>

                <div className="mt-4 flex-1 border-t border-border pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {products.length === 1 ? "1 producto" : `${products.length} productos`}
                  </p>
                  {products.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {products.slice(0, 6).map((p) => (
                        <li key={p.id} className={`rounded-full border border-border px-2.5 py-0.5 text-xs ${p.active ? "" : "opacity-60 line-through"}`}>{p.name}</li>
                      ))}
                      {products.length > 6 && <li className="px-1 text-xs text-muted-foreground">+{products.length - 6} más</li>}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">Sin productos capturados.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <details className="group rounded-xl border border-dashed border-border p-4 open:border-solid open:bg-background open:shadow-sm">
          <summary className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer list-none group-open:hidden [&::-webkit-details-marker]:hidden`}>+ Agregar proveedor</summary>
          <h2 className="hidden text-sm font-semibold group-open:block">Nuevo proveedor</h2>
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
