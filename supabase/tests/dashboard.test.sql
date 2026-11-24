-- Pruebas de dashboard, conversión de moneda, metas y exportación auditada (Fase 5).
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is(public.local_date('2026-11-20 01:04+00'), '2026-11-19'::date, 'una venta de las 19:04 en CDMX cuenta el mismo día local');
create temp table m as select public.dashboard_metrics(current_date - 30, current_date) as j;
select is((select (j->>'won_amount')::numeric from m), 1000::numeric, 'el vendedor solo suma sus ventas ganadas');
select is((select (j->>'won_units')::numeric from m), 10::numeric, 'cuenta unidades vendidas');
select is((select (j->>'open_weighted')::numeric from m), 50::numeric, 'pipeline ponderado por probabilidad');

select throws_ok($$ insert into public.goals (organization_id, name, metric, period_start, period_end, target, created_by)
  values (public.current_org_id(), 'Mi meta', 'units', current_date, current_date, 1, public.current_profile_id()) $$,
  '42501', null, 'un vendedor no define metas');
select throws_ok($$ insert into public.exchange_rates (organization_id, base_currency, quote_currency, rate, effective_at)
  values (public.current_org_id(), 'USD', 'EUR', 0.9, current_date) $$,
  '42501', null, 'un vendedor no captura tipos de cambio');
select throws_ok($$ select public.log_export('oportunidades', 1, '{}') $$, '42501', null, 'un vendedor no exporta');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
truncate m;
insert into m select public.dashboard_metrics(current_date - 30, current_date);
select is((select (j->>'won_amount')::numeric from m), 2000::numeric, 'admin suma todo convertido a la moneda de reporte');
select is((select (j->>'won_margin')::numeric from m), 1600::numeric, 'margen convertido');
select is((select (j->>'unconverted')::int from m), 0, 'todas las monedas tienen tipo de cambio');
select is(public.convert_amount(1000, 'MXN', 'USD'), 50::numeric, 'convierte con la tasa inversa');
select is(public.convert_amount(1, 'USD', 'EUR'), null, 'sin tasa no inventa conversión');
select is((select reached::int from public.stage_conversion(
  (select default_pipeline_id from public.products where code = 'IHS' and organization_id = public.current_org_id()), current_date - 30, current_date)
  where sort_order = (select min(sort_order) from public.pipeline_stages s join public.products p on p.default_pipeline_id = s.pipeline_id where p.code = 'IHS' and p.organization_id = public.current_org_id())),
  3, 'conversión: las 3 oportunidades llegaron a la primera etapa');

insert into public.goals (organization_id, name, metric, period_start, period_end, target, currency_code, created_by)
values (public.current_org_id(), 'Venta del mes', 'revenue', current_date - 30, current_date, 4000, 'USD', public.current_profile_id());
insert into public.goals (organization_id, name, metric, period_start, period_end, target, owner_id, created_by)
select public.current_org_id(), 'Unidades ' || email, 'units', current_date - 30, current_date, 20, id, public.current_profile_id()
from public.profiles where email in ('rep1@test.dev', 'rep2@test.dev');
select is((select actual from public.goals_progress() where name = 'Venta del mes'), 2000::numeric, 'avance de meta de venta');

select lives_ok($$ select public.log_export('oportunidades', 3, '{"from":"2026-01-01"}') $$, 'admin exporta');
select is((select count(*)::int from public.audit_log where table_name = 'export:oportunidades'), 1, 'la exportación queda auditada');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select results_eq($$ select name, actual from public.goals_progress() order by name $$,
  $$ values ('Unidades rep1@test.dev'::text, 10::numeric), ('Venta del mes', 1000) $$,
  'el vendedor ve su meta y la general, con avance de su cartera');

-- Metas por empresa: solo cuenta la venta (y la institución) de esa empresa.
reset role;
insert into public.companies (organization_id, legal_name, country_code)
select id, 'Empresa B', 'MX' from public.organizations where slug = 'org-a';
update public.opportunities set company_id = (select id from public.companies where legal_name = 'Empresa B') where name = 'Colegio Tres IHS';
update public.institutions set company_id = (select id from public.companies where legal_name = 'Empresa B') where name = 'Colegio Tres';
insert into public.goals (organization_id, name, metric, period_start, period_end, target, currency_code, company_id)
select organization_id, 'Venta Empresa B', 'revenue', current_date - 30, current_date, 4000, 'USD', id from public.companies where legal_name = 'Empresa B';
insert into public.goals (organization_id, name, metric, period_start, period_end, target, company_id)
select organization_id, 'Colegios Empresa B', 'new_institutions', current_date - 30, current_date, 5, id from public.companies where legal_name = 'Empresa B';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select actual from public.goals_progress() where name = 'Venta Empresa B'), 1000::numeric, 'meta por empresa: solo la venta de esa empresa (20,000 MXN = 1000 USD)');
select is((select actual from public.goals_progress() where name = 'Colegios Empresa B'), 1::numeric, 'meta por empresa: solo sus instituciones nuevas');

-- Repartir una meta general entre vendedores.
create temp table reps as select array_agg(id order by email) ids from public.profiles where email in ('rep1@test.dev', 'rep2@test.dev');
grant select on reps to authenticated;
select is((select public.split_goal((select id from public.goals where name = 'Venta del mes'), ids) from reps), 2, 'reparte la meta general');
select results_eq($$ select name, target, actual from public.goals_progress() where name like 'Venta del mes · %' order by name $$,
  $$ values ('Venta del mes · rep1@test.dev'::text, 2000::numeric, 1000::numeric), ('Venta del mes · rep2@test.dev', 2000, 1000) $$,
  'partes iguales, cada vendedor con su propio avance');
select throws_ok($$ select public.split_goal((select id from public.goals where name = 'Venta del mes'), ids, '{3000,500}') from reps $$,
  'EB001', 'Los objetivos suman 3500, pero la meta general es 4000.0000.', 'los montos deben sumar el objetivo general');
select public.split_goal((select id from public.goals where name = 'Venta del mes'), ids, '{3000,1000}') from reps;
select is((select string_agg(target::int::text, ',' order by name) from public.goals where name like 'Venta del mes · %'), '3000,1000',
  'volver a repartir reemplaza el reparto anterior');
select throws_ok($$ select public.split_goal((select id from public.goals where name = 'Venta del mes · rep1@test.dev'), ids) from reps $$,
  'EB001', 'Solo se reparte una meta general (sin vendedor).', 'no se reparte la meta de un vendedor');
select public.split_goal((select id from public.goals where name = 'Colegios Empresa B'), ids) from reps;
select is((select string_agg(target::int::text, ',' order by name) from public.goals where name like 'Colegios Empresa B · %'), '3,2',
  'en conteos el residuo va completo al primero, sin fracciones');
delete from public.goals where name = 'Venta del mes';
select is((select count(*)::int from public.goals where name like 'Venta del mes%'), 0, 'borrar la general borra su reparto');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.split_goal((select id from public.goals where name = 'Colegios Empresa B'), ids) from reps $$,
  'EB001', 'No tienes permiso para administrar metas.', 'un vendedor no reparte metas');

-- Equipos: la meta de equipo suma lo de sus miembros.
reset role;
create temp table rep1 as select id from public.profiles where email = 'rep1@test.dev';
grant select on rep1 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.teams (organization_id, name, leader_id) values (public.current_org_id(), 'Equipo Norte', (select id from rep1));
insert into public.team_members (organization_id, team_id, profile_id) select public.current_org_id(), t.id, r.id from public.teams t, rep1 r;
insert into public.goals (organization_id, name, metric, period_start, period_end, target, team_id, created_by)
select public.current_org_id(), 'Unidades Norte', 'units', current_date - 30, current_date, 50, id, public.current_profile_id() from public.teams;
select is((select actual from public.goals_progress() where name = 'Unidades Norte'), 10::numeric, 'la meta de equipo suma solo a sus miembros');
select throws_ok($$ insert into public.goals (organization_id, name, metric, period_start, period_end, target, team_id, owner_id, created_by)
  select public.current_org_id(), 'Mixta', 'units', current_date, current_date, 1, t.id, r.id, public.current_profile_id() from public.teams t, rep1 r $$,
  '23514', null, 'una meta es de equipo o de vendedor, no de ambos');
insert into public.teams (organization_id, name) values (public.current_org_id(), 'Equipo Sur');
select throws_ok($$ insert into public.team_members (organization_id, team_id, profile_id)
  select public.current_org_id(), t.id, r.id from public.teams t, rep1 r where t.name = 'Equipo Sur' $$,
  '23505', null, 'cada persona está en un solo equipo');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.teams), 2, 'toda la organización ve los equipos');
select throws_ok($$ insert into public.teams (organization_id, name) values (public.current_org_id(), 'Mío') $$,
  '42501', null, 'un vendedor no crea equipos');

select * from finish();
rollback;
