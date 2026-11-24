-- Ficha completa del proveedor (Will, 2026-11-24): datos generales, dirección, logo y contactos.
-- Las ventas salen de las oportunidades de su pipeline y los documentos ya existen (documents.product_id).

alter table public.products
  add column legal_name text check (legal_name is null or length(legal_name) <= 200),
  add column tax_id text check (tax_id is null or length(tax_id) <= 30),
  add column website text check (website is null or length(website) <= 300),
  add column phone text check (phone is null or length(phone) <= 40),
  add column email text check (email is null or (email = lower(trim(email)) and length(email) <= 200)),
  add column address text check (address is null or length(address) <= 300),
  add column city text check (city is null or length(city) <= 100),
  add column state text check (state is null or length(state) <= 100),
  add column postal_code text check (postal_code is null or length(postal_code) <= 20),
  add column country text check (country is null or length(country) <= 100),
  -- Ruta del logo en el bucket privado "logos" (<organización>/<uuid>.<ext>).
  add column logo_path text check (logo_path is null or logo_path like organization_id::text || '/%');

-- Personas de contacto del proveedor (no son contactos de institución: esos se ven según la institución).
create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  supplier_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 200),
  job_title text check (job_title is null or length(job_title) <= 120),
  email text check (email is null or (email = lower(trim(email)) and length(email) <= 200)),
  phone text check (phone is null or length(phone) <= 40),
  notes text check (notes is null or length(notes) <= 1000),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (supplier_id, organization_id) references public.products(id, organization_id) on delete cascade
);
create index supplier_contacts_supplier on public.supplier_contacts (supplier_id);
-- Un solo contacto principal por proveedor.
create unique index supplier_contacts_one_primary on public.supplier_contacts (supplier_id) where is_primary;

-- Solo proveedores (no productos) tienen contactos.
create or replace function public.supplier_contacts_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.products where id = new.supplier_id and supplier_id is not null) then
    raise exception 'Los contactos se agregan al proveedor, no a un producto' using errcode = 'EB001';
  end if;
  return new;
end;
$$;
create trigger supplier_contacts_guard before insert or update of supplier_id on public.supplier_contacts
for each row execute function public.supplier_contacts_guard();
create trigger supplier_contacts_set_updated_at before update on public.supplier_contacts
for each row execute function public.set_updated_at();
create trigger supplier_contacts_audit after insert or update or delete on public.supplier_contacts
for each row execute function public.audit_row();

-- Como el catálogo: toda la organización lo lee; solo catalog.manage lo cambia.
alter table public.supplier_contacts enable row level security;
create policy supplier_contacts_select on public.supplier_contacts for select to authenticated
  using (organization_id = public.current_org_id());
create policy supplier_contacts_insert on public.supplier_contacts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('catalog.manage'));
create policy supplier_contacts_update on public.supplier_contacts for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('catalog.manage'))
  with check (organization_id = public.current_org_id());
create policy supplier_contacts_delete on public.supplier_contacts for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('catalog.manage'));
grant select, insert, update, delete on public.supplier_contacts to authenticated;

-- ============ Storage: logos ============
-- Privado: se muestra con URL firmada. Sin SVG (puede llevar scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy logos_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_org_id()::text);
create policy logos_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_org_id()::text
              and public.has_permission('catalog.manage'));
create policy logos_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.current_org_id()::text
         and public.has_permission('catalog.manage'));
