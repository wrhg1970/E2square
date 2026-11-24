-- Consultas a los datos: indicadores fijos, agrupaciones y permisos (RLS).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev', 'sales_rep'), ('rep2@test.dev', 'sales_rep')) x(email, role) on true
join public.roles r on r.organization_id = o.id and r.key = x.role
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev');
insert into public.exchange_rates (organization_id, base_currency, quote_currency, rate, effective_at)
select id, 'USD', 'MXN', 20, current_date - 1 from public.organizations where slug = 'org-a';

set local role authenticated;

-- Crea una institución + oportunidad IHS del usuario actual con una línea.
create function pg_temp.sell(inst text, cur text, qty numeric, price numeric, cost numeric, win boolean) returns void
language plpgsql as $$
declare i uuid; o uuid; p public.products;
begin
  select * into p from public.products where code = 'IHS' and organization_id = public.current_org_id();
  insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
  values (public.current_org_id(), inst, 'school', 'MX', public.current_profile_id(), public.current_profile_id()) returning id into i;
  insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, created_by)
  values (public.current_org_id(), i, p.default_pipeline_id,
    (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id order by sort_order limit 1),
    inst || ' IHS', public.current_profile_id(), cur, public.current_profile_id()) returning id into o;
  insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price, unit_cost)
  values (public.current_org_id(), o, p.id, qty, price, cost);
  if win then
    update public.opportunities set expected_close_date = current_date, stage_id = (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and is_won)
    where id = o;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.sell('Colegio Uno', 'USD', 10, 100, 40, true);   -- ganada: 1000 USD, margen 600
select pg_temp.sell('Colegio Dos', 'USD', 5, 100, 0, false);    -- abierta en Lead (10%): 500 USD
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select pg_temp.sell('Colegio Tres', 'MXN', 5, 4000, 0, true);   -- ganada: 20,000 MXN = 1000 USD
select is((select value from public.query_metric('won_amount', 'total', current_date - 30, current_date)), 1000::numeric,
  'el vendedor solo consulta sus ventas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select value from public.query_metric('won_amount', 'total', current_date - 30, current_date)), 2000::numeric,
  'el administrador ve todo, convertido a la moneda de reporte');
select results_eq($$ select label, value from public.query_metric('won_units', 'owner', current_date - 30, current_date) order by label $$,
  $$ values ('rep1@test.dev'::text, 10::numeric), ('rep2@test.dev', 5) $$, 'agrupa por vendedor');
select is((select value from public.query_metric('won_count', 'month', current_date - 30, current_date) where label = to_char(current_date, 'YYYY-MM')),
  2::numeric, 'agrupa por mes');
select throws_ok($$ select * from public.query_metric('drop table', 'total', current_date, current_date) $$, 'EB001', 'Indicador no válido.',
  'solo acepta indicadores del menú');
select throws_ok($$ select * from public.query_metric('won_count', 'total', current_date, current_date - 1) $$, 'EB001', null,
  'valida el rango de fechas');

select * from finish();
rollback;
