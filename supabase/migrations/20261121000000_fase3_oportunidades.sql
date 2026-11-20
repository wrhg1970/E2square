-- Reglas de negocio: errcode EB001 lleva un mensaje en español apto para mostrar al usuario.
-- Fase 3: catálogo de productos, listas de precios, pipelines configurables y oportunidades.

insert into public.permissions (key, description) values
  ('catalog.manage', 'Administrar productos, precios y pipelines')
on conflict (key) do nothing;

-- ============ Catálogo ============
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  company_id uuid,
  business_unit_id uuid,
  code text not null check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name text not null check (length(trim(name)) > 1),
  description text,
  category text,
  revenue_model text not null default 'direct' check (revenue_model in ('direct', 'commission', 'subscription', 'mixed')),
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  default_pipeline_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies(id, organization_id),
  foreign key (business_unit_id, organization_id) references public.business_units(id, organization_id)
);

-- Lista de precios por producto: cada renglón es un precio vigente en una moneda y unidad.
create table public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  unit_name text not null default 'alumno',
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  valid_from date not null default current_date,
  valid_to date check (valid_to is null or valid_to >= valid_from),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id) on delete cascade
);
create index price_list_items_product on public.price_list_items (product_id);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 1),
  product_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id)
);

alter table public.products
  add foreign key (default_pipeline_id, organization_id) references public.pipelines(id, organization_id);

-- required_fields: datos que exige la etapa para entrar en ella.
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  pipeline_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null,
  default_probability integer not null check (default_probability between 0 and 100),
  required_fields text[] not null default '{}'
    check (required_fields <@ array['expected_close_date', 'items', 'primary_contact', 'loss_reason']),
  sla_days integer check (sla_days is null or sla_days > 0),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (is_won and is_lost)),
  unique (pipeline_id, sort_order) deferrable initially deferred,
  unique (id, organization_id),
  unique (id, pipeline_id),
  foreign key (pipeline_id, organization_id) references public.pipelines(id, organization_id) on delete cascade
);

-- ============ Oportunidades ============
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  institution_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  name text not null check (length(trim(name)) > 1),
  owner_id uuid,
  primary_contact_id uuid,
  company_id uuid,
  business_unit_id uuid,
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  amount numeric(18,4) not null default 0,
  cost numeric(18,4) not null default 0,
  margin numeric(18,4) generated always as (amount - cost) stored,
  probability integer not null check (probability between 0 and 100),
  expected_close_date date,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'cancelled')),
  source text,
  loss_reason text,
  competitor text,
  notes text check (notes is null or length(notes) <= 5000),
  stage_entered_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id),
  foreign key (pipeline_id, organization_id) references public.pipelines(id, organization_id),
  foreign key (stage_id, pipeline_id) references public.pipeline_stages(id, pipeline_id),
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id),
  foreign key (primary_contact_id, organization_id) references public.contacts(id, organization_id),
  foreign key (company_id, organization_id) references public.companies(id, organization_id),
  foreign key (business_unit_id, organization_id) references public.business_units(id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
create index opportunities_institution on public.opportunities (institution_id);
create index opportunities_pipeline_stage on public.opportunities (pipeline_id, stage_id);
create index opportunities_owner on public.opportunities (owner_id);

-- Las líneas guardan precio y costo acordados (snapshot): cambiar el catálogo no altera ventas históricas.
create table public.opportunity_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  product_id uuid not null,
  price_list_item_id uuid,
  description text,
  quantity numeric(18,4) not null check (quantity > 0),
  unit_price numeric(18,4) not null check (unit_price >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  line_total numeric(18,4) generated always as (round(quantity * unit_price * (1 - discount_pct / 100), 4)) stored,
  line_cost numeric(18,4) generated always as (round(quantity * unit_cost, 4)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.products(id, organization_id),
  foreign key (price_list_item_id, organization_id) references public.price_list_items(id, organization_id)
);
create index opportunity_items_opp on public.opportunity_items (opportunity_id);

create table public.opportunity_stage_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  opportunity_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  note text,
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id) on delete cascade
);
create index opportunity_stage_history_opp on public.opportunity_stage_history (opportunity_id, changed_at);

-- ============ Reglas de negocio ============
-- Antes de guardar: etapa válida, estado y probabilidad derivados de la etapa, requisitos de la etapa.
create or replace function public.opportunity_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st public.pipeline_stages;
  stage_changed boolean := tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id;
  missing text[] := '{}';
begin
  select * into st from public.pipeline_stages where id = new.stage_id and pipeline_id = new.pipeline_id;
  if st.id is null then
    raise exception 'La etapa no pertenece al pipeline de la oportunidad' using errcode = 'EB001';
  end if;

  if stage_changed then
    new.stage_entered_at := now();
    if tg_op = 'INSERT' or new.probability is not distinct from old.probability then
      new.probability := st.default_probability;
    end if;
    new.status := case when st.is_won then 'won' when st.is_lost then 'lost'
                       when new.status = 'cancelled' then 'cancelled' else 'open' end;
    new.closed_at := case when new.status in ('won', 'lost') then now() end;

    if 'expected_close_date' = any(st.required_fields) and new.expected_close_date is null then
      missing := array_append(missing, 'fecha estimada de cierre');
    end if;
    if 'primary_contact' = any(st.required_fields) and new.primary_contact_id is null then
      missing := array_append(missing, 'contacto principal');
    end if;
    if 'items' = any(st.required_fields) and (tg_op = 'INSERT' or new.amount <= 0) then
      missing := array_append(missing, 'al menos un producto con monto');
    end if;
    if (st.is_lost or 'loss_reason' = any(st.required_fields)) and coalesce(trim(new.loss_reason), '') = '' then
      missing := array_append(missing, 'motivo de pérdida');
    end if;
    if array_length(missing, 1) > 0 then
      raise exception 'Para pasar a "%" falta: %', st.name, array_to_string(missing, ', ') using errcode = 'EB001';
    end if;
  end if;

  if new.status = 'cancelled' and tg_op = 'UPDATE' and old.status <> 'cancelled' then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger opportunities_before_write before insert or update on public.opportunities
for each row execute function public.opportunity_before_write();

create or replace function public.opportunity_log_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    insert into public.opportunity_stage_history (organization_id, opportunity_id, from_stage_id, to_stage_id, changed_by)
    values (new.organization_id, new.id, case when tg_op = 'UPDATE' then old.stage_id end, new.stage_id, public.current_profile_id());
  end if;
  return new;
end;
$$;

create trigger opportunities_log_stage after insert or update on public.opportunities
for each row execute function public.opportunity_log_stage();

-- Totales de la oportunidad = suma de sus líneas.
create or replace function public.opportunity_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  opp uuid := coalesce(new.opportunity_id, old.opportunity_id);
begin
  update public.opportunities o
  set amount = coalesce(t.total, 0), cost = coalesce(t.cost, 0)
  from (select sum(line_total) as total, sum(line_cost) as cost from public.opportunity_items where opportunity_id = opp) t
  where o.id = opp;
  return null;
end;
$$;

create trigger opportunity_items_recalc after insert or update or delete on public.opportunity_items
for each row execute function public.opportunity_recalc();

-- Una oportunidad cerrada no cambia sus líneas (protege montos históricos).
create or replace function public.opportunity_items_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.opportunities where id = coalesce(new.opportunity_id, old.opportunity_id) and status <> 'open') then
    raise exception 'La oportunidad está cerrada; reábrela para cambiar productos' using errcode = 'EB001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger opportunity_items_guard before insert or update or delete on public.opportunity_items
for each row execute function public.opportunity_items_guard();

-- ============ Catálogo por defecto (productos del PRD) ============
create or replace function public.create_default_catalog(org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p record;
  pl uuid;
begin
  for p in select * from (values
    ('IHS', 'IHS'), ('CID', 'Centro de Idiomas Digital'), ('ESPORTS', 'E-Sports'), ('XPLORE', 'Xplore Together'),
    ('ARUKAY', 'Arukay'), ('EVAL', 'Evaluaciones'), ('TOEFL', 'TOEFL')
  ) as x(code, name) loop
    continue when exists (select 1 from public.products where organization_id = org and code = p.code);
    insert into public.pipelines (organization_id, name) values (org, 'Pipeline ' || p.name) returning id into pl;
    insert into public.pipeline_stages (organization_id, pipeline_id, name, sort_order, default_probability, required_fields, sla_days, is_won, is_lost)
    values
      (org, pl, 'Lead', 1, 10, '{}', 3, false, false),
      (org, pl, 'Calificado', 2, 25, '{}', 7, false, false),
      (org, pl, 'Propuesta', 3, 50, '{items}', 10, false, false),
      (org, pl, 'Negociación', 4, 75, '{items,expected_close_date}', 14, false, false),
      (org, pl, 'Ganada', 5, 100, '{items,expected_close_date}', null, true, false),
      (org, pl, 'Perdida', 6, 0, '{loss_reason}', null, false, true);
    insert into public.products (organization_id, code, name, default_pipeline_id) values (org, p.code, p.name, pl);
    update public.pipelines set product_id = (select id from public.products where organization_id = org and code = p.code) where id = pl;
  end loop;
end;
$$;
revoke execute on function public.create_default_catalog(uuid) from public, anon, authenticated;

-- Permisos por rol (se agregan a los de Fase 1 y 2).
insert into public.role_permissions (organization_id, role_id, permission_key)
select r.organization_id, r.id, 'catalog.manage' from public.roles r where r.key in ('admin', 'sales_director')
on conflict (role_id, permission_key) do nothing;

create or replace function public.bootstrap_organization(org_name text, org_slug text, admin_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  insert into public.organizations (name, slug) values (org_name, org_slug)
  on conflict (slug) do update set name = excluded.name
  returning id into org;
  perform public.create_default_roles(org);
  insert into public.role_permissions (organization_id, role_id, permission_key)
  select org, r.id, 'catalog.manage' from public.roles r where r.organization_id = org and r.key in ('admin', 'sales_director')
  on conflict (role_id, permission_key) do nothing;
  perform public.create_default_catalog(org);
  insert into public.invitations (organization_id, email, role_id)
  select org, lower(trim(admin_email)), id from public.roles where organization_id = org and key = 'admin'
  on conflict (organization_id, email) do nothing;
  return org;
end;
$$;
revoke execute on function public.bootstrap_organization(text, text, text) from public, anon, authenticated;

select public.create_default_catalog(id) from public.organizations;

-- ============ Visibilidad ============
create or replace function public.can_see_opportunity(opp public.opportunities)
returns boolean language sql stable security definer set search_path = '' as $$
  select opp.organization_id = public.current_org_id()
    and (opp.owner_id = public.current_profile_id() or public.can_see_institution_id(opp.institution_id))
$$;

create or replace function public.can_see_opportunity_id(opp_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_see_opportunity(o) from public.opportunities o where o.id = opp_id), false)
$$;

-- ============ Triggers comunes ============
do $$
declare t text;
begin
  foreach t in array array['products', 'price_list_items', 'pipelines', 'pipeline_stages', 'opportunities', 'opportunity_items'] loop
    execute format('create trigger %1$s_set_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ============ RLS ============
alter table public.products enable row level security;
alter table public.price_list_items enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_items enable row level security;
alter table public.opportunity_stage_history enable row level security;

-- Catálogo: todos lo leen; solo catalog.manage lo cambia.
do $$
declare t text;
begin
  foreach t in array array['products', 'price_list_items', 'pipelines', 'pipeline_stages'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (organization_id = public.current_org_id())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (organization_id = public.current_org_id() and public.has_permission(''catalog.manage''))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (organization_id = public.current_org_id() and public.has_permission(''catalog.manage'')) with check (organization_id = public.current_org_id())', t);
  end loop;
end $$;

create policy opportunities_select on public.opportunities for select to authenticated
  using (public.can_see_opportunity(opportunities));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('institutions.write')
              and created_by = public.current_profile_id() and public.can_see_institution_id(institution_id));
create policy opportunities_update on public.opportunities for update to authenticated
  using (public.can_see_opportunity(opportunities) and public.has_permission('institutions.write'))
  with check (organization_id = public.current_org_id());

create policy opportunity_items_select on public.opportunity_items for select to authenticated
  using (public.can_see_opportunity_id(opportunity_id));
create policy opportunity_items_insert on public.opportunity_items for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('institutions.write') and public.can_see_opportunity_id(opportunity_id));
create policy opportunity_items_update on public.opportunity_items for update to authenticated
  using (public.has_permission('institutions.write') and public.can_see_opportunity_id(opportunity_id))
  with check (organization_id = public.current_org_id());
create policy opportunity_items_delete on public.opportunity_items for delete to authenticated
  using (public.has_permission('institutions.write') and public.can_see_opportunity_id(opportunity_id));

create policy opportunity_stage_history_select on public.opportunity_stage_history for select to authenticated
  using (public.can_see_opportunity_id(opportunity_id));

-- Prospecto particular (alumno o padre de familia): soportado para el futuro, no es el flujo principal B2B.
alter table public.institutions drop constraint institutions_institution_type_check;
alter table public.institutions add constraint institutions_institution_type_check
  check (institution_type in ('school', 'university', 'education_group', 'company', 'association', 'individual', 'other'));
