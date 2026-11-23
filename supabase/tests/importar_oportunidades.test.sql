-- Importación de oportunidades históricas: fecha real, sin comisiones ni tareas automáticas, con permisos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select public.bootstrap_organization('Org I', 'org-i', 'admin-i@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep-i@test.dev', 'sales_rep')) x(email, role_key) on true
join public.roles r on r.organization_id = o.id and r.key = x.role_key where o.slug = 'org-i';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin-i@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'rep-i@test.dev');
create temp table ids as
select o.id as org, (select id from public.profiles where email = 'rep-i@test.dev') as rep,
  (select id from public.products where organization_id = o.id and code = 'TOEFL') as toefl,
  (select id from public.products where organization_id = o.id and code = 'IHS') as ihs
from public.organizations o where o.slug = 'org-i';
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
select org, 'Colegio Historia', 'school', 'MX', rep, rep from ids;
-- Si hubiera comisión o automatización, la importación no debe dispararlas.
insert into public.commission_rates (organization_id, profile_id, product_id, rate_pct, basis) select org, rep, toefl, 10, 'sale' from ids;
insert into public.automation_rules (organization_id, key, enabled) select org, k, true from ids, unnest(array['first_contact', 'won_handoff']) k;
alter table ids add column inst uuid;
update ids set inst = (select id from public.institutions where name = 'Colegio Historia');
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select throws_ok($$ select public.import_opportunity(inst, toefl, null, 'X', null, 'MXN', 100, 0, 'won', '2025-06-30', null) from ids $$,
  'EB001', 'No tienes permiso para importar.', 'un vendedor no importa');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select lives_ok($$ select public.import_opportunity(inst, toefl, null, 'Venta 2025', rep, 'MXN', 5000, 2000, 'won', '2025-06-30', null) from ids $$,
  'importa una venta ganada');
select is((select (status, amount, margin, public.local_date(closed_at))::text from public.opportunities where name = 'Venta 2025'),
  '(won,5000.0000,3000.0000,2025-06-30)', 'queda ganada, con monto, margen y su fecha real de cierre');
select is((select count(*)::int from public.commissions), 0, 'una venta histórica no genera comisiones');
select is((select count(*)::int from public.activities where automation_key is not null), 0, 'ni tareas automáticas');
select lives_ok($$ select public.import_opportunity(inst, toefl, null, null, null, 'USD', 300, null, 'lost', '2025-03-01', null) from ids $$,
  'importa una perdida sin nombre ni motivo');
select is((select (name, loss_reason)::text from public.opportunities where status = 'lost'), '("TOEFL · Colegio Historia","Sin motivo registrado")',
  'nombre y motivo por omisión');
select throws_ok($$ select public.import_opportunity(inst, toefl, ihs, 'Y', null, 'MXN', 1, 0, 'open', null, null) from ids $$,
  'EB001', 'El producto no es de ese proveedor.', 'valida que el producto sea del proveedor');
select lives_ok($$ insert into public.import_runs (organization_id, entity, file_name, total_rows, created_rows, skipped_rows, created_by)
  values (public.current_org_id(), 'opportunities', 'ventas.xlsx', 2, 2, 0, public.current_profile_id()) $$,
  'queda bitácora de la importación de oportunidades');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select is((select count(*)::int from public.opportunities where imported_at is not null), 2, 'el responsable ve sus ventas importadas');

select * from finish();
rollback;
