-- Proveedores con varios productos (Will, 2026-11-20).
-- Un proveedor es un registro de products sin supplier_id: tiene el pipeline y agrupa sus productos.
-- Los 7 registros actuales quedan como proveedores; oportunidades, precios, metas y comisiones no cambian.

alter table public.products add column supplier_id uuid;
alter table public.products
  add foreign key (supplier_id, organization_id) references public.products(id, organization_id),
  add check (supplier_id is null or default_pipeline_id is null),
  add check (supplier_id is distinct from id);
create index products_supplier on public.products (supplier_id);

-- Solo un nivel: el proveedor de un producto no puede ser a su vez producto de otro.
create or replace function public.products_supplier_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.supplier_id is not null and exists (select 1 from public.products where id = new.supplier_id and supplier_id is not null) then
    raise exception 'Elige un proveedor, no un producto' using errcode = 'EB001';
  end if;
  if new.supplier_id is not null and exists (select 1 from public.products where supplier_id = new.id) then
    raise exception 'Este proveedor tiene productos; no puede quedar dentro de otro proveedor' using errcode = 'EB001';
  end if;
  return new;
end;
$$;
create trigger products_supplier_guard before insert or update of supplier_id on public.products
for each row execute function public.products_supplier_guard();

-- Las líneas nuevas de una oportunidad usan productos de su proveedor (el dueño del pipeline) o el proveedor mismo.
create or replace function public.opportunity_items_supplier_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.opportunities o
    join public.products s on s.default_pipeline_id = o.pipeline_id
    join public.products p on p.id = new.product_id
    where o.id = new.opportunity_id and (p.id = s.id or p.supplier_id = s.id)
  ) then
    raise exception 'Ese producto no es de este proveedor' using errcode = 'EB001';
  end if;
  return new;
end;
$$;
create trigger opportunity_items_supplier_guard before insert or update of product_id on public.opportunity_items
for each row execute function public.opportunity_items_supplier_guard();
