-- Pruebas de comisiones (Fase 7c).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev', 'sales_rep'), ('rep2@test.dev', 'sales_rep'), ('dir@test.dev', 'sales_director')) x(email, role_key) on true
join public.roles r on r.organization_id = o.id and r.key = x.role_key
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev'),
  ('00000000-0000-0000-0000-00000000000d', 'dir@test.dev');

-- Las líneas de una oportunidad son productos de su proveedor (TOEFL): EVAL e IHS se simulan como productos de TOEFL.
insert into public.products (organization_id, code, name, supplier_id)
select p.organization_id, x.c, x.n, p.id from public.products p, (values ('EVAL-T', 'Evaluación TOEFL'), ('IHS-T', 'IHS TOEFL')) x(c, n)
where p.code = 'TOEFL';

create temp table ids as
select o.id as org,
  (select id from public.profiles where email = 'rep1@test.dev') as rep1,
  (select id from public.profiles where email = 'dir@test.dev') as dir,
  (select id from public.products where organization_id = o.id and code = 'TOEFL') as toefl,
  (select id from public.products where organization_id = o.id and code = 'EVAL-T') as eval,
  (select id from public.products where organization_id = o.id and code = 'IHS-T') as ihs,
  (select default_pipeline_id from public.products where organization_id = o.id and code = 'TOEFL') as pipeline
from public.organizations o where o.slug = 'org-a';
alter table ids add column neg uuid, add column won uuid;
update ids set neg = (select id from public.pipeline_stages where pipeline_id = ids.pipeline and name = 'Negociación'),
               won = (select id from public.pipeline_stages where pipeline_id = ids.pipeline and name = 'Ganada');
grant select on ids to authenticated;

-- Crea una oportunidad ganable del dueño actual con líneas TOEFL, EVAL e IHS.
create function pg_temp.new_opp(p_name text) returns uuid language plpgsql as $$
declare oid uuid; inst uuid;
begin
  insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
  values (public.current_org_id(), 'Colegio ' || p_name, 'school', 'MX', public.current_profile_id(), public.current_profile_id()) returning id into inst;
  insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, created_by, expected_close_date)
  select public.current_org_id(), inst, pipeline, (select id from public.pipeline_stages where pipeline_id = ids.pipeline and name = 'Lead'),
         p_name, public.current_profile_id(), 'MXN', 0, public.current_profile_id(), '2027-01-31' from ids returning id into oid;
  insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price, discount_pct, unit_cost)
  select public.current_org_id(), oid, x.p, x.q, x.price, x.disc, x.cost from ids,
  lateral (values (ids.toefl, 30, 150, 10, 60), (ids.eval, 2, 1000, 0, 400), (ids.ihs, 1, 500, 0, 0)) x(p, q, price, disc, cost);
  return oid;
end $$;
grant execute on function pg_temp.new_opp(text) to authenticated;

set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ insert into public.commission_rates (organization_id, profile_id, product_id, rate_pct, basis) select org, rep1, toefl, 50, 'sale' from ids $$,
  '42501', null, 'un vendedor no define su propio porcentaje');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
select lives_ok($$
  insert into public.commission_rates (organization_id, profile_id, product_id, rate_pct, basis)
  select org, rep1, toefl, 10, 'sale' from ids union all
  select org, rep1, eval, 20, 'margin' from ids union all
  select org, dir, toefl, 5, 'sale' from ids $$,
  'el director define porcentajes por agente y producto, sobre venta o margen');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
create temp table opp1 as select pg_temp.new_opp('Venta Rep') as id;
grant select on opp1 to authenticated;
update public.opportunities set stage_id = (select won from ids) where id = (select id from opp1);

select is((select string_agg(basis || ':' || amount::text, ', ' order by basis) from public.commissions), 'margin:240.0000, sale:405.0000',
  'al ganar: TOEFL 10% de la venta 4050 = 405; EVAL 20% del margen 1200 = 240; IHS sin porcentaje no comisiona');
select is((select count(*)::int from public.commissions where status = 'pending'), 2, 'el agente ve sus comisiones pendientes');
select throws_ok($$ select public.decide_commission((select id from public.commissions limit 1), 'approved') $$, 'EB001', null,
  'el agente no puede aprobar');
update public.commissions set status = 'approved', amount = 99999;
select is((select count(*)::int from public.commissions where status = 'pending' and amount < 1000), 2,
  'el agente no puede editar sus comisiones directamente');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.commissions), 0, 'otro agente no ve comisiones ajenas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.opportunities set stage_id = (select neg from ids) where id = (select id from opp1);
select is((select count(*)::int from public.commissions), 0, 'reabrir la oportunidad borra las comisiones pendientes');
update public.opportunities set stage_id = (select won from ids) where id = (select id from opp1);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
select throws_ok($$ select public.decide_commission((select id from public.commissions where basis = 'margin'), 'rejected', ' ') $$, 'EB001', null,
  'rechazar exige motivo');
select public.decide_commission((select id from public.commissions where basis = 'margin'), 'rejected', 'Margen mal capturado');
select public.decide_commission((select id from public.commissions where basis = 'sale'), 'approved');
select is((select (status, decided_by = dir)::text from public.commissions, ids where basis = 'sale'), '(approved,t)',
  'el director aprueba y queda registrado quién');
select throws_ok($$ select public.decide_commission((select id from public.commissions where basis = 'margin'), 'paid') $$, 'EB001', null,
  'una comisión rechazada no se paga');
select public.decide_commission((select id from public.commissions where basis = 'sale'), 'paid');
select ok((select paid_at is not null and status = 'paid' from public.commissions where basis = 'sale'), 'se marca como pagada');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ update public.opportunities set stage_id = (select neg from ids) where id = (select id from opp1) $$, 'EB001', null,
  'no se reabre una oportunidad con comisiones pagadas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
create temp table opp2 as select pg_temp.new_opp('Venta Director') as id;
update public.opportunities set stage_id = (select won from ids) where id = (select id from opp2);
select throws_ok($$ select public.decide_commission((select c.id from public.commissions c, ids where c.profile_id = ids.dir), 'approved') $$,
  'EB001', 'No puedes aprobar tu propia comisión.', 'el director no aprueba su propia comisión: le toca a su superior');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select throws_ok($$ select public.decide_commission((select c.id from public.commissions c, ids where c.profile_id = ids.dir), 'approved') $$,
  'EB001', null, 'el administrador del sistema no aprueba comisiones');

reset role;
select ok((select count(*) from public.audit_log where table_name = 'commissions' and action = 'UPDATE') >= 3,
  'cada decisión queda en la bitácora');

select * from finish();
rollback;
