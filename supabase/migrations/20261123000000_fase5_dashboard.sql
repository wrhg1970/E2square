-- Fase 5: tipos de cambio, metas, métricas del dashboard y exportación auditada.
-- Las métricas son SECURITY INVOKER: cada usuario solo suma lo que su cartera le deja ver (RLS).

alter table public.organizations add column reporting_currency char(3) not null default 'USD' check (reporting_currency ~ '^[A-Z]{3}$');

insert into public.permissions (key, description) values
  ('goals.manage', 'Definir metas'),
  ('reports.export', 'Exportar datos (queda auditado)')
on conflict (key) do nothing;

insert into public.role_permissions (organization_id, role_id, permission_key)
select r.organization_id, r.id, m.perm
from public.roles r
join (values ('admin', 'goals.manage'), ('admin', 'reports.export'), ('sales_director', 'goals.manage'),
             ('sales_director', 'reports.export'), ('general_director', 'reports.export'), ('office_manager', 'reports.export')) m(role_key, perm)
  on m.role_key = r.key
on conflict (role_id, permission_key) do nothing;

-- Que las organizaciones nuevas también reciban estos permisos.
create or replace function public.grant_phase5_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organization_id, role_id, permission_key)
  select new.organization_id, new.id, m.perm
  from (values ('admin', 'goals.manage'), ('admin', 'reports.export'), ('sales_director', 'goals.manage'),
               ('sales_director', 'reports.export'), ('general_director', 'reports.export'), ('office_manager', 'reports.export'),
               ('admin', 'catalog.manage'), ('sales_director', 'catalog.manage')) m(role_key, perm)
  where m.role_key = new.key
  on conflict (role_id, permission_key) do nothing;
  return new;
end;
$$;
create trigger roles_grant_phase5 after insert on public.roles
for each row execute function public.grant_phase5_permissions();

-- ============ Tipos de cambio ============
-- rate: cuántas unidades de quote_currency vale 1 base_currency.
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency char(3) not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(20,8) not null check (rate > 0),
  effective_at date not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  check (base_currency <> quote_currency),
  unique (organization_id, base_currency, quote_currency, effective_at)
);

-- Convierte con la tasa vigente a esa fecha (directa o inversa). Null si no hay tasa: nunca inventa.
create or replace function public.convert_amount(amount numeric, from_cur text, to_cur text, at_date date default current_date)
returns numeric language sql stable set search_path = '' as $$
  select case
    when amount is null then null
    when from_cur = to_cur then amount
    else (
      select amount * r.factor from (
        select rate as factor, effective_at from public.exchange_rates
        where organization_id = public.current_org_id() and base_currency = from_cur and quote_currency = to_cur and effective_at <= at_date
        union all
        select 1 / rate, effective_at from public.exchange_rates
        where organization_id = public.current_org_id() and base_currency = to_cur and quote_currency = from_cur and effective_at <= at_date
        order by effective_at desc limit 1
      ) r
    )
  end
$$;

-- ============ Metas ============
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) > 1),
  metric text not null check (metric in ('revenue', 'margin', 'units', 'new_institutions', 'activities')),
  period_start date not null,
  period_end date not null,
  target numeric(18,4) not null check (target > 0),
  currency_code char(3) check (currency_code ~ '^[A-Z]{3}$'),
  owner_id uuid,
  office_id uuid,
  product_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((metric in ('revenue', 'margin')) = (currency_code is not null)),
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id),
  foreign key (office_id, organization_id) references public.offices(id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);

-- ============ Métricas ============
-- Oportunidades visibles con su producto principal (el de su pipeline) y su oficina (la de la institución).
create or replace view public.opportunity_facts with (security_invoker = true) as
select o.id, o.organization_id, o.name, o.institution_id, o.owner_id, o.status, o.currency_code, o.amount, o.cost, o.margin, o.probability,
       o.expected_close_date, o.closed_at, o.created_at, o.stage_id, o.pipeline_id, o.stage_entered_at,
       p.id as product_id, i.office_id,
       (select coalesce(sum(quantity), 0) from public.opportunity_items it where it.opportunity_id = o.id) as units
from public.opportunities o
join public.institutions i on i.id = o.institution_id
left join public.products p on p.default_pipeline_id = o.pipeline_id;

create or replace function public.dashboard_metrics(
  p_from date, p_to date, p_owner uuid default null, p_office uuid default null, p_product uuid default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with cur as (select reporting_currency as c from public.organizations where id = public.current_org_id()),
  f as (
    select f.*,
      public.convert_amount(f.amount, f.currency_code, cur.c, coalesce(f.closed_at::date, current_date)) as amount_r,
      public.convert_amount(f.margin, f.currency_code, cur.c, coalesce(f.closed_at::date, current_date)) as margin_r
    from public.opportunity_facts f, cur
    where (p_owner is null or f.owner_id = p_owner)
      and (p_office is null or f.office_id = p_office)
      and (p_product is null or f.product_id = p_product)
  ),
  closed as (select * from f where status in ('won', 'lost') and closed_at::date between p_from and p_to),
  open as (select * from f where status = 'open'),
  st as (select id, sla_days from public.pipeline_stages)
  select jsonb_build_object(
    'currency', (select c from cur),
    'won_amount', coalesce((select sum(amount_r) from closed where status = 'won'), 0),
    'won_margin', coalesce((select sum(margin_r) from closed where status = 'won'), 0),
    'won_units', coalesce((select sum(units) from closed where status = 'won'), 0),
    'won_count', (select count(*) from closed where status = 'won'),
    'lost_count', (select count(*) from closed where status = 'lost'),
    'avg_cycle_days', (select round(avg(extract(epoch from closed_at - created_at) / 86400)) from closed where status = 'won'),
    'open_amount', coalesce((select sum(amount_r) from open), 0),
    'open_weighted', coalesce((select sum(amount_r * probability / 100.0) from open), 0),
    'open_count', (select count(*) from open),
    'forecast', coalesce((select sum(amount_r * probability / 100.0) from open where expected_close_date between p_from and p_to), 0),
    'stalled_count', (select count(*) from open o join st on st.id = o.stage_id where st.sla_days is not null and o.stage_entered_at < now() - make_interval(days => st.sla_days)),
    'unconverted', (select count(*) from f where amount_r is null and amount <> 0),
    'new_institutions', (select count(*) from public.institutions i
                          where i.created_at::date between p_from and p_to
                            and (p_owner is null or i.owner_id = p_owner) and (p_office is null or i.office_id = p_office)),
    'activities_done', (select count(*) from public.activities a
                         where a.status = 'done' and a.completed_at::date between p_from and p_to
                           and (p_owner is null or a.owner_id = p_owner)),
    'by_product', coalesce((
      select jsonb_agg(x order by x.won desc) from (
        select p.name, sum(amount_r) filter (where status = 'won' and closed_at::date between p_from and p_to) as won,
               sum(amount_r) filter (where status = 'open') as open, count(*) filter (where status = 'open') as open_count
        from f join public.products p on p.id = f.product_id group by p.name
      ) x), '[]'::jsonb),
    'generated_at', now()
  )
$$;

-- Conversión por etapa de un pipeline: cuántas oportunidades (creadas en el periodo) llegaron a cada etapa.
create or replace function public.stage_conversion(p_pipeline uuid, p_from date, p_to date, p_owner uuid default null)
returns table (stage_id uuid, name text, sort_order int, reached bigint)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.name, s.sort_order,
    (select count(distinct h.opportunity_id)
     from public.opportunity_stage_history h
     join public.opportunities o on o.id = h.opportunity_id
     join public.pipeline_stages hs on hs.id = h.to_stage_id
     where o.pipeline_id = p_pipeline and o.created_at::date between p_from and p_to
       and (p_owner is null or o.owner_id = p_owner)
       and (case when s.is_lost then hs.id = s.id else hs.sort_order >= s.sort_order and not hs.is_lost end))
  from public.pipeline_stages s
  where s.pipeline_id = p_pipeline
  order by s.sort_order
$$;

-- Avance de cada meta visible, en la moneda de la meta.
create or replace function public.goals_progress()
returns table (id uuid, name text, metric text, period_start date, period_end date, target numeric, currency_code text,
               owner_id uuid, office_id uuid, product_id uuid, actual numeric, unconverted bigint)
language sql stable security invoker set search_path = '' as $$
  select g.id, g.name, g.metric, g.period_start, g.period_end, g.target, g.currency_code, g.owner_id, g.office_id, g.product_id,
    case g.metric
      when 'revenue' then w.revenue
      when 'margin' then w.margin
      when 'units' then w.units
      when 'new_institutions' then (select count(*) from public.institutions i
        where i.created_at::date between g.period_start and g.period_end
          and (g.owner_id is null or i.owner_id = g.owner_id) and (g.office_id is null or i.office_id = g.office_id))
      when 'activities' then (select count(*) from public.activities a
        where a.status = 'done' and a.completed_at::date between g.period_start and g.period_end
          and (g.owner_id is null or a.owner_id = g.owner_id))
    end,
    case when g.metric in ('revenue', 'margin') then w.unconverted else 0 end
  from public.goals g
  cross join lateral (
    select coalesce(sum(c.amount_g), 0) as revenue, coalesce(sum(c.margin_g), 0) as margin, coalesce(sum(c.units), 0) as units,
           count(*) filter (where c.amount_g is null) as unconverted
    from (
      select f.units,
        public.convert_amount(f.amount, f.currency_code, g.currency_code, f.closed_at::date) as amount_g,
        public.convert_amount(f.margin, f.currency_code, g.currency_code, f.closed_at::date) as margin_g
      from public.opportunity_facts f
      where f.status = 'won' and f.closed_at::date between g.period_start and g.period_end
        and (g.owner_id is null or f.owner_id = g.owner_id)
        and (g.office_id is null or f.office_id = g.office_id)
        and (g.product_id is null or f.product_id = g.product_id)
    ) c
  ) w
  order by g.period_start desc, g.name
$$;

-- Bitácora de exportaciones (requisito de seguridad: exportaciones auditadas).
create or replace function public.log_export(kind text, row_count int, filters jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('reports.export') then
    raise exception 'Sin permiso para exportar' using errcode = '42501';
  end if;
  insert into public.audit_log (organization_id, actor_auth_user_id, table_name, action, new_data)
  values (public.current_org_id(), auth.uid(), 'export:' || kind, 'INSERT', jsonb_build_object('rows', row_count, 'filters', filters));
end;
$$;

-- ============ Triggers y RLS ============
create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger goals_audit after insert or update or delete on public.goals for each row execute function public.audit_row();
create trigger exchange_rates_audit after insert or update or delete on public.exchange_rates for each row execute function public.audit_row();

alter table public.exchange_rates enable row level security;
alter table public.goals enable row level security;

create policy exchange_rates_select on public.exchange_rates for select to authenticated
  using (organization_id = public.current_org_id());
create policy exchange_rates_insert on public.exchange_rates for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('admin.structure'));

-- Metas: cada quien ve las suyas, las de su oficina/organización; quien las gestiona ve todas.
create policy goals_select on public.goals for select to authenticated
  using (organization_id = public.current_org_id() and (
    public.has_permission('goals.manage') or public.has_permission('institutions.read_all')
    or owner_id = public.current_profile_id()
    or owner_id is null
  ));
create policy goals_insert on public.goals for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('goals.manage') and created_by = public.current_profile_id());
create policy goals_update on public.goals for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('goals.manage'))
  with check (organization_id = public.current_org_id());
create policy goals_delete on public.goals for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('goals.manage'));
