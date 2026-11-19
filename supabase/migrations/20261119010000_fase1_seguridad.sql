-- Fase 1: estructura organizacional, perfiles, roles, permisos, ámbitos y auditoría.
-- Regla: la organización es el límite de tenant; ningún dato cruza organizaciones (FKs compuestas + RLS).

-- ============ Estructura ============

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  legal_name text not null check (length(trim(legal_name)) > 0),
  tax_id text,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  company_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies(id, organization_id)
);

create table public.offices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  company_id uuid not null,
  business_unit_id uuid,
  name text not null check (length(trim(name)) > 0),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies(id, organization_id),
  foreign key (business_unit_id, organization_id) references public.business_units(id, organization_id)
);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 0),
  parent_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (parent_id, organization_id) references public.territories(id, organization_id)
);

-- ============ Usuarios, roles y permisos ============
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  full_name text not null default '',
  email text not null,
  locale text not null default 'es-MX',
  timezone text not null default 'America/Mexico_City',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

-- Catálogo global de permisos (no depende de la organización).
create table public.permissions (
  key text primary key,
  description text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_id uuid not null,
  permission_key text not null references public.permissions(key),
  unique (role_id, permission_key),
  foreign key (role_id, organization_id) references public.roles(id, organization_id) on delete cascade
);

create table public.profile_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  profile_id uuid not null,
  role_id uuid not null,
  unique (profile_id, role_id),
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id) on delete cascade,
  foreign key (role_id, organization_id) references public.roles(id, organization_id) on delete cascade
);

-- Ámbito de datos de cada usuario. Se aplica a instituciones y oportunidades a partir de Fase 2.
create table public.user_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  profile_id uuid not null,
  scope_type text not null check (scope_type in ('organization', 'company', 'business_unit', 'office', 'territory')),
  scope_id uuid not null,
  created_at timestamptz not null default now(),
  unique (profile_id, scope_type, scope_id),
  foreign key (profile_id, organization_id) references public.profiles(id, organization_id) on delete cascade
);

-- Invitaciones: solo un correo invitado obtiene perfil al registrarse.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  email text not null check (email = lower(trim(email)) and email like '%@%'),
  role_id uuid not null,
  invited_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email),
  foreign key (role_id, organization_id) references public.roles(id, organization_id)
);

-- ============ Auditoría ============
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_auth_user_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);

-- ============ Funciones de seguridad ============
-- security definer: leen perfiles/roles sin recursión de RLS. search_path vacío evita secuestro de funciones.
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select organization_id from public.profiles
  where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles
  where auth_user_id = auth.uid() and status = 'active'
$$;

create or replace function public.has_permission(permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    join public.role_permissions rp on rp.role_id = pr.role_id
    where p.auth_user_id = auth.uid() and p.status = 'active' and rp.permission_key = permission
  )
$$;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (organization_id, actor_auth_user_id, table_name, record_id, action, old_data, new_data)
  values (
    coalesce((rec->>'organization_id')::uuid, case when tg_table_name = 'organizations' then (rec->>'id')::uuid end),
    auth.uid(),
    tg_table_name,
    (rec->>'id')::uuid,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Valida que el ámbito apunte a una entidad de la misma organización.
create or replace function public.validate_user_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  ok boolean;
begin
  ok := case new.scope_type
    when 'organization' then new.scope_id = new.organization_id
    when 'company' then exists (select 1 from public.companies where id = new.scope_id and organization_id = new.organization_id)
    when 'business_unit' then exists (select 1 from public.business_units where id = new.scope_id and organization_id = new.organization_id)
    when 'office' then exists (select 1 from public.offices where id = new.scope_id and organization_id = new.organization_id)
    when 'territory' then exists (select 1 from public.territories where id = new.scope_id and organization_id = new.organization_id)
  end;
  if not ok then
    raise exception 'Ámbito % % no pertenece a la organización', new.scope_type, new.scope_id;
  end if;
  return new;
end;
$$;

create trigger user_scopes_validate before insert or update on public.user_scopes
for each row execute function public.validate_user_scope();

-- Alta de perfil al registrarse, solo si el correo fue invitado.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  new_profile_id uuid;
begin
  select * into inv from public.invitations
  where email = lower(new.email) and accepted_at is null
  order by created_at limit 1;
  if inv.id is null then
    return new;
  end if;
  insert into public.profiles (auth_user_id, organization_id, email, full_name)
  values (new.id, inv.organization_id, lower(new.email), coalesce(new.raw_user_meta_data->>'full_name', ''))
  returning id into new_profile_id;
  insert into public.profile_roles (organization_id, profile_id, role_id)
  values (inv.organization_id, new_profile_id, inv.role_id);
  update public.invitations set accepted_at = now() where id = inv.id;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Roles por defecto del PRD para una organización.
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
    ('general_director', 'audit.read')
  ) as m(role_key, perm) on m.role_key = r.key
  join public.permissions p on p.key = m.perm
  where r.organization_id = org
  on conflict (role_id, permission_key) do nothing;
end;
$$;

-- Arranque: crea la organización, sus roles y la invitación del primer administrador.
-- Ejecutar una sola vez desde el SQL Editor de Supabase.
create or replace function public.bootstrap_organization(org_name text, org_slug text, admin_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  insert into public.organizations (name, slug) values (org_name, org_slug)
  on conflict (slug) do update set name = excluded.name
  returning id into org;
  perform public.create_default_roles(org);
  insert into public.invitations (organization_id, email, role_id)
  select org, lower(trim(admin_email)), id from public.roles where organization_id = org and key = 'admin'
  on conflict (organization_id, email) do nothing;
  return org;
end;
$$;

revoke execute on function public.create_default_roles(uuid) from public, anon, authenticated;
revoke execute on function public.bootstrap_organization(text, text, text) from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

insert into public.permissions (key, description) values
  ('admin.structure', 'Administrar empresas, unidades, oficinas y territorios'),
  ('admin.users', 'Administrar usuarios, invitaciones, roles y ámbitos'),
  ('audit.read', 'Consultar la bitácora de auditoría');

-- ============ updated_at y auditoría ============
do $$
declare t text;
begin
  foreach t in array array['companies', 'business_units', 'offices', 'territories', 'profiles', 'roles'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['organizations', 'companies', 'business_units', 'offices', 'territories', 'profiles', 'roles',
                           'role_permissions', 'profile_roles', 'user_scopes', 'invitations'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ============ RLS ============
alter table public.companies enable row level security;
alter table public.business_units enable row level security;
alter table public.offices enable row level security;
alter table public.territories enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profile_roles enable row level security;
alter table public.user_scopes enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

create policy organizations_select on public.organizations for select to authenticated
  using (id = public.current_org_id());

create policy permissions_select on public.permissions for select to authenticated using (true);

-- Lectura por organización; escritura según permiso. Sin políticas de DELETE: no se borra desde la app.
do $$
declare
  t text;
  perm text;
begin
  for t, perm in select * from (values
    ('companies', 'admin.structure'), ('business_units', 'admin.structure'), ('offices', 'admin.structure'),
    ('territories', 'admin.structure'), ('profiles', 'admin.users'), ('roles', 'admin.users'),
    ('role_permissions', 'admin.users'), ('profile_roles', 'admin.users'), ('user_scopes', 'admin.users'),
    ('invitations', 'admin.users')) as v
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (organization_id = public.current_org_id() and public.has_permission(%2$L))', t, perm);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (organization_id = public.current_org_id() and public.has_permission(%2$L)) with check (organization_id = public.current_org_id())', t, perm);
  end loop;
end $$;

-- Quitar o cambiar roles sí debe poderse desde la administración.
create policy profile_roles_delete on public.profile_roles for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.users'));
create policy user_scopes_delete on public.user_scopes for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.users'));

create policy audit_log_select on public.audit_log for select to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('audit.read'));
