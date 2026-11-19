-- Fase 2: instituciones, sucursales, grupos, contactos, roles de decisión, duplicados e importaciones.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Normaliza nombres para detectar duplicados: minúsculas, sin acentos ni signos, espacios simples.
create or replace function public.normalize_name(value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select trim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Dominio de un sitio web: sin protocolo, www ni ruta.
create or replace function public.web_domain(value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(regexp_replace(regexp_replace(lower(trim(coalesce(value, ''))), '^[a-z]+://', ''), '^www\.|[/:?#].*$', '', 'g'), '')
$$;

create or replace function public.phone_digits(value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(value, ''), '\D', '', 'g'), 10), '')
$$;

-- ============ Instituciones ============
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  parent_institution_id uuid,
  name text not null check (length(trim(name)) > 1),
  legal_name text,
  institution_type text not null check (institution_type in ('school', 'university', 'education_group', 'company', 'association', 'other')),
  subtype text,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  region text,
  city text,
  address text,
  website text,
  phone text,
  email text,
  tax_id text,
  estimated_size integer check (estimated_size is null or estimated_size >= 0),
  company_id uuid,
  business_unit_id uuid,
  office_id uuid,
  territory_id uuid,
  owner_id uuid,
  source text,
  status text not null default 'prospect' check (status in ('prospect', 'active_client', 'former_client', 'inactive')),
  potential text check (potential in ('high', 'medium', 'low')),
  tags text[] not null default '{}',
  notes text check (notes is null or length(notes) <= 5000),
  normalized_name text generated always as (public.normalize_name(name)) stored,
  website_domain text generated always as (public.web_domain(website)) stored,
  phone_key text generated always as (public.phone_digits(phone)) stored,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (parent_institution_id is null or parent_institution_id <> id),
  foreign key (parent_institution_id, organization_id) references public.institutions(id, organization_id),
  foreign key (company_id, organization_id) references public.companies(id, organization_id),
  foreign key (business_unit_id, organization_id) references public.business_units(id, organization_id),
  foreign key (office_id, organization_id) references public.offices(id, organization_id),
  foreign key (territory_id, organization_id) references public.territories(id, organization_id),
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
create index institutions_org_name_trgm on public.institutions using gin (normalized_name extensions.gin_trgm_ops);
create index institutions_org_domain on public.institutions (organization_id, website_domain);
create index institutions_org_phone on public.institutions (organization_id, phone_key);
create index institutions_org_tax on public.institutions (organization_id, tax_id);
create index institutions_owner on public.institutions (owner_id);
create index institutions_office on public.institutions (office_id);
create index institutions_parent on public.institutions (parent_institution_id);

create table public.institution_branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  institution_id uuid not null,
  name text not null check (length(trim(name)) > 1),
  address text,
  city text,
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id) on delete cascade
);
create index institution_branches_inst on public.institution_branches (institution_id);

-- ============ Contactos ============
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null default '',
  email text check (email is null or email = lower(trim(email))),
  phone text,
  preferred_language text not null default 'es',
  preferred_channel text check (preferred_channel in ('email', 'phone', 'whatsapp', 'in_person')),
  consent_status text not null default 'unknown' check (consent_status in ('unknown', 'granted', 'revoked')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
-- Evitar duplicar personas: un correo por organización.
create unique index contacts_org_email on public.contacts (organization_id, email) where email is not null;

create table public.institution_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  institution_id uuid not null,
  contact_id uuid not null,
  job_title text,
  department text,
  decision_role text check (decision_role in ('decision_maker', 'influencer', 'user', 'buyer', 'finance', 'operational')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (institution_id, contact_id),
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts(id, organization_id) on delete cascade
);
create index institution_contacts_contact on public.institution_contacts (contact_id);

-- ============ Importaciones (bitácora) ============
create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  entity text not null check (entity in ('institutions')),
  file_name text not null,
  total_rows integer not null,
  created_rows integer not null,
  skipped_rows integer not null,
  errors jsonb not null default '[]',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);

-- ============ Permisos nuevos ============
insert into public.permissions (key, description) values
  ('institutions.read_all', 'Ver todas las instituciones y contactos de la organización'),
  ('institutions.write', 'Crear y editar instituciones y contactos de su cartera'),
  ('import.run', 'Importar datos desde Excel')
on conflict (key) do nothing;

create or replace function public.create_default_roles(org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (organization_id, key, name) values
    (org, 'admin', 'Administrador'),
    (org, 'general_director', 'Dirección general'),
    (org, 'sales_director', 'Director comercial'),
    (org, 'office_manager', 'Gerente de oficina'),
    (org, 'sales_rep', 'Vendedor'),
    (org, 'marketing', 'Marketing'),
    (org, 'viewer', 'Consulta')
  on conflict (organization_id, key) do nothing;

  insert into public.role_permissions (organization_id, role_id, permission_key)
  select org, r.id, p.key
  from public.roles r
  join (values
    ('admin', 'admin.structure'), ('admin', 'admin.users'), ('admin', 'audit.read'),
    ('admin', 'institutions.read_all'), ('admin', 'institutions.write'), ('admin', 'import.run'),
    ('general_director', 'audit.read'), ('general_director', 'institutions.read_all'),
    ('sales_director', 'institutions.read_all'), ('sales_director', 'institutions.write'), ('sales_director', 'import.run'),
    ('office_manager', 'institutions.write'), ('office_manager', 'import.run'),
    ('sales_rep', 'institutions.write'),
    ('marketing', 'institutions.read_all')
  ) as m(role_key, perm) on m.role_key = r.key
  join public.permissions p on p.key = m.perm
  where r.organization_id = org
  on conflict (role_id, permission_key) do nothing;
end;
$$;
revoke execute on function public.create_default_roles(uuid) from public, anon, authenticated;

-- Aplica los permisos nuevos a las organizaciones existentes.
select public.create_default_roles(id) from public.organizations;

-- ============ Visibilidad por cartera ============
-- Ve una institución quien tiene read_all, es su propietario, o tiene ámbito sobre su organización,
-- empresa, unidad, oficina o territorio.
create or replace function public.can_see_institution(inst public.institutions)
returns boolean language sql stable security definer set search_path = '' as $$
  select inst.organization_id = public.current_org_id() and (
    public.has_permission('institutions.read_all')
    or inst.owner_id = public.current_profile_id()
    or inst.created_by = public.current_profile_id()
    or exists (
      select 1 from public.user_scopes s
      where s.profile_id = public.current_profile_id()
        and (
          (s.scope_type = 'organization' and s.scope_id = inst.organization_id)
          or (s.scope_type = 'company' and s.scope_id = inst.company_id)
          or (s.scope_type = 'business_unit' and s.scope_id = inst.business_unit_id)
          or (s.scope_type = 'office' and s.scope_id = inst.office_id)
          or (s.scope_type = 'territory' and s.scope_id = inst.territory_id)
        )
    )
  )
$$;

create or replace function public.can_see_institution_id(inst_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_see_institution(i) from public.institutions i where i.id = inst_id), false)
$$;

create or replace function public.can_see_contact(contact public.contacts)
returns boolean language sql stable security definer set search_path = '' as $$
  select contact.organization_id = public.current_org_id() and (
    public.has_permission('institutions.read_all')
    or contact.created_by = public.current_profile_id()
    or exists (
      select 1 from public.institution_contacts ic
      where ic.contact_id = contact.id and public.can_see_institution_id(ic.institution_id)
    )
  )
$$;

-- Candidatos a duplicado en toda la organización (aunque no estén en la cartera de quien busca),
-- devolviendo solo lo necesario para decidir. Nunca fusiona.
create or replace function public.find_institution_duplicates(
  p_name text, p_website text default null, p_phone text default null, p_tax_id text default null, p_exclude uuid default null
)
returns table (id uuid, name text, city text, owner_name text, reason text, score real)
language sql stable security definer set search_path = '' as $$
  with q as (
    select public.normalize_name(p_name) as n, public.web_domain(p_website) as d,
           public.phone_digits(p_phone) as ph, nullif(upper(trim(coalesce(p_tax_id, ''))), '') as tax
  )
  select i.id, i.name, i.city, coalesce(nullif(p.full_name, ''), p.email),
    case
      when q.tax is not null and upper(i.tax_id) = q.tax then 'Mismo identificador fiscal'
      when q.d is not null and i.website_domain = q.d then 'Mismo sitio web'
      when q.ph is not null and i.phone_key = q.ph then 'Mismo teléfono'
      else 'Nombre similar'
    end,
    extensions.similarity(i.normalized_name, q.n)
  from public.institutions i
  cross join q
  left join public.profiles p on p.id = i.owner_id
  where i.organization_id = public.current_org_id()
    and (p_exclude is null or i.id <> p_exclude)
    and (
      (q.tax is not null and upper(i.tax_id) = q.tax)
      or (q.d is not null and i.website_domain = q.d)
      or (q.ph is not null and i.phone_key = q.ph)
      or extensions.similarity(i.normalized_name, q.n) >= 0.6
    )
  order by 6 desc
  limit 5
$$;

-- ============ Triggers ============
do $$
declare t text;
begin
  foreach t in array array['institutions', 'institution_branches', 'contacts'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['institutions', 'institution_branches', 'contacts', 'institution_contacts', 'import_runs'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ============ RLS ============
alter table public.institutions enable row level security;
alter table public.institution_branches enable row level security;
alter table public.contacts enable row level security;
alter table public.institution_contacts enable row level security;
alter table public.import_runs enable row level security;

create policy institutions_select on public.institutions for select to authenticated
  using (public.can_see_institution(institutions));
create policy institutions_insert on public.institutions for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('institutions.write') and created_by = public.current_profile_id());
create policy institutions_update on public.institutions for update to authenticated
  using (public.can_see_institution(institutions) and public.has_permission('institutions.write'))
  with check (organization_id = public.current_org_id());

create policy institution_branches_select on public.institution_branches for select to authenticated
  using (public.can_see_institution_id(institution_id));
create policy institution_branches_write on public.institution_branches for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('institutions.write') and public.can_see_institution_id(institution_id));
create policy institution_branches_update on public.institution_branches for update to authenticated
  using (public.has_permission('institutions.write') and public.can_see_institution_id(institution_id))
  with check (organization_id = public.current_org_id());

create policy contacts_select on public.contacts for select to authenticated
  using (public.can_see_contact(contacts));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('institutions.write') and created_by = public.current_profile_id());
create policy contacts_update on public.contacts for update to authenticated
  using (public.can_see_contact(contacts) and public.has_permission('institutions.write'))
  with check (organization_id = public.current_org_id());

create policy institution_contacts_select on public.institution_contacts for select to authenticated
  using (public.can_see_institution_id(institution_id));
create policy institution_contacts_insert on public.institution_contacts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('institutions.write') and public.can_see_institution_id(institution_id));
create policy institution_contacts_update on public.institution_contacts for update to authenticated
  using (public.has_permission('institutions.write') and public.can_see_institution_id(institution_id))
  with check (organization_id = public.current_org_id());
create policy institution_contacts_delete on public.institution_contacts for delete to authenticated
  using (public.has_permission('institutions.write') and public.can_see_institution_id(institution_id));

create policy import_runs_select on public.import_runs for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('import.run'));
create policy import_runs_insert on public.import_runs for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('import.run') and created_by = public.current_profile_id());
