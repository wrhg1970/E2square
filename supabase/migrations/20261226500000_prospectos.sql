-- Prospectos: personas (familias, alumnos) que llegan de formularios como Meta Lead Ads, antes de ser clientes.
-- Reglas propuestas (pendientes de confirmar por Will):
--   * Cada quien ve los prospectos que tiene asignados o que importó; quien tiene institutions.read_all ve todos.
--   * Importan quienes tienen import.run; cambian estatus y notas quienes tienen institutions.write.
--   * Un prospecto no se repite: mismo Lead ID (por origen) en la organización. La app además omite correos ya registrados.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  product_id uuid references public.products(id),
  source text not null default 'meta' check (source in ('meta', 'web', 'referral', 'event', 'other')),
  external_id text check (external_id is null or length(external_id) between 1 and 100),
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  email text check (email is null or email = lower(trim(email))),
  phone text check (phone is null or length(phone) <= 40),
  city text check (city is null or length(city) <= 120),
  region text check (region is null or length(region) <= 120),
  country text check (country is null or length(country) <= 120),
  respondent text check (respondent is null or length(respondent) <= 120),
  age_range text check (age_range is null or length(age_range) <= 60),
  grade text check (grade is null or length(grade) <= 120),
  received_at timestamptz,
  notes text check (notes is null or length(notes) <= 4000),
  status text not null default 'new' check (status in ('new', 'contacting', 'qualified', 'converted', 'discarded')),
  owner_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
create unique index if not exists leads_org_external on public.leads (organization_id, source, external_id) where external_id is not null;
create index if not exists leads_org_email on public.leads (organization_id, email) where email is not null;
create index if not exists leads_org_received on public.leads (organization_id, received_at desc);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();
drop trigger if exists leads_audit on public.leads;
create trigger leads_audit after insert or update or delete on public.leads
for each row execute function public.audit_row();

alter table public.leads enable row level security;
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (organization_id = public.current_org_id() and (
    public.has_permission('institutions.read_all') or owner_id = public.current_profile_id() or created_by = public.current_profile_id()));
create policy leads_insert on public.leads for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('import.run') and created_by = public.current_profile_id());
create policy leads_update on public.leads for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('institutions.write') and (
    public.has_permission('institutions.read_all') or owner_id = public.current_profile_id() or created_by = public.current_profile_id()))
  with check (organization_id = public.current_org_id());
grant select, insert, update on public.leads to authenticated;

-- Al editar no cambian la organización, el origen, el Lead ID ni quién lo importó.
create or replace function public.leads_keep_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.organization_id := old.organization_id;
  new.source := old.source;
  new.external_id := old.external_id;
  new.created_by := old.created_by;
  return new;
end $$;
drop trigger if exists leads_keep_identity on public.leads;
create trigger leads_keep_identity before update on public.leads
for each row execute function public.leads_keep_identity();

alter table public.import_runs drop constraint if exists import_runs_entity_check;
alter table public.import_runs add constraint import_runs_entity_check check (entity in ('institutions', 'opportunities', 'leads'));
