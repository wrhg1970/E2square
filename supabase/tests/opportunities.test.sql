-- Pruebas de catálogo, pipeline y oportunidades (Fase 3).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev'), ('rep2@test.dev')) x(email) on true
join public.roles r on r.organization_id = o.id and r.key = 'sales_rep'
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev');

select is((select count(*)::int from public.products p join public.organizations o on o.id = p.organization_id where o.slug = 'org-a'), 7,
  'la organización nace con los 7 productos del PRD');
select is((select count(*)::int from public.pipeline_stages s join public.products p on p.default_pipeline_id = s.pipeline_id join public.organizations o on o.id = p.organization_id where p.code = 'TOEFL' and o.slug = 'org-a'), 6,
  'cada producto tiene su pipeline con 6 etapas');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Sol', 'school', 'MX', public.current_profile_id(), public.current_profile_id());

create temp table ids as
select p.id as product_id, p.default_pipeline_id as pipeline_id,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Lead') as lead,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Propuesta') as proposal,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Ganada') as won,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Perdida') as lost,
  (select id from public.institutions where name = 'Colegio Sol') as inst
from public.products p where p.code = 'TOEFL' and p.organization_id = public.current_org_id();
grant select on ids to authenticated;

insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, created_by)
select public.current_org_id(), inst, pipeline_id, lead, 'TOEFL 2027', public.current_profile_id(), 'USD', 0, public.current_profile_id() from ids;

select is((select probability from public.opportunities), 10, 'la probabilidad sale de la etapa');
select throws_ok($$ update public.opportunities set stage_id = (select proposal from ids) $$, 'EB001', null,
  'no pasa a Propuesta sin productos');

insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price, discount_pct, unit_cost)
select public.current_org_id(), o.id, ids.product_id, 30, 150, 10, 60 from public.opportunities o, ids;
select is((select (amount, cost, margin)::text from public.opportunities), '(4050.0000,1800.0000,2250.0000)',
  'monto, costo y margen se calculan de las líneas (30 x 150 - 10%, costo 30 x 60)');

update public.opportunities set stage_id = (select proposal from ids);
select is((select probability from public.opportunities), 50, 'con productos pasa a Propuesta');

select throws_ok($$ update public.opportunities set stage_id = (select won from ids) $$, 'EB001', null,
  'no se gana sin fecha estimada de cierre');
select throws_ok($$ update public.opportunities set stage_id = (select lost from ids) $$, 'EB001', null,
  'no se pierde sin motivo');

update public.opportunities set stage_id = (select won from ids), expected_close_date = '2027-01-31';
select is((select status from public.opportunities), 'won', 'ganada al llegar a la etapa ganadora');
select ok((select closed_at is not null from public.opportunities), 'registra la fecha de cierre');
select is((select count(*)::int from public.opportunity_stage_history), 3, 'el historial guarda cada cambio de etapa');

select throws_ok(
  $$ update public.opportunity_items set unit_price = 1 $$, 'EB001', null, 'una oportunidad cerrada no cambia sus montos');

select throws_ok(
  $$ update public.opportunities set stage_id = (select id from public.pipeline_stages where pipeline_id <> (select pipeline_id from ids) limit 1) $$,
  null, null, 'la etapa debe ser del mismo pipeline');

select throws_ok(
  $$ insert into public.products (organization_id, code, name) values (public.current_org_id(), 'NUEVO', 'Nuevo') $$,
  '42501', null, 'un vendedor no administra el catálogo');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.opportunities) + (select count(*)::int from public.opportunity_items), 0,
  'otro vendedor no ve oportunidades ni líneas ajenas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select count(*)::int from public.opportunities), 1, 'admin ve la oportunidad');

select * from finish();
rollback;
