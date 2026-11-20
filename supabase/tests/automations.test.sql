-- Pruebas de automatizaciones internas (Fase 8a).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

create temp table ids as
select p.id as product, p.default_pipeline_id as pipeline,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Lead') as lead,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Ganada') as won,
  (select id from public.profiles where email = 'rep2@test.dev') as rep2
from public.products p join public.organizations o on o.id = p.organization_id where o.slug = 'org-a' and p.code = 'TOEFL';
grant select on ids to authenticated;

create function pg_temp.new_opp(p_name text) returns uuid language plpgsql as $$
declare oid uuid; inst uuid;
begin
  insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
  values (public.current_org_id(), 'Colegio ' || p_name, 'school', 'MX', public.current_profile_id(), public.current_profile_id()) returning id into inst;
  insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, created_by, expected_close_date)
  select public.current_org_id(), inst, pipeline, lead, p_name, public.current_profile_id(), 'MXN', 0, public.current_profile_id(), '2027-01-31'
  from ids returning id into oid;
  return oid;
end $$;
grant execute on function pg_temp.new_opp(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.new_opp('Sin reglas');
select is((select count(*)::int from public.activities), 0, 'apagadas por defecto: no crean tareas');
select throws_ok($$ insert into public.automation_rules (organization_id, key, enabled) values (public.current_org_id(), 'first_contact', true) $$,
  '42501', null, 'un vendedor no configura automatizaciones');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.automation_rules (organization_id, key, enabled, days) values
  (public.current_org_id(), 'first_contact', true, 1), (public.current_org_id(), 'won_handoff', true, 2), (public.current_org_id(), 'owner_change', true, 0);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
create temp table opp as select pg_temp.new_opp('Con reglas') as id;
select is((select (activity_type, status, owner_id = public.current_profile_id(), due_at::date = (now() + interval '1 day')::date)::text
           from public.activities where automation_key = 'first_contact'),
  '(call,pending,t,t)', 'al crear la oportunidad se programa el primer contacto del dueño a 1 día');

insert into public.opportunity_items (organization_id, opportunity_id, product_id, quantity, unit_price)
select public.current_org_id(), opp.id, ids.product, 1, 100 from opp, ids;
update public.opportunities set stage_id = (select won from ids) where id = (select id from opp);
select is((select count(*)::int from public.activities where automation_key = 'won_handoff' and due_at::date = (now() + interval '2 days')::date), 1,
  'al ganar se programa la entrega a operación');

update public.opportunities set name = 'Con reglas (editada)' where id = (select id from opp);
select is((select count(*)::int from public.activities where opportunity_id = (select id from opp)), 2,
  'editar otros campos no crea tareas nuevas');

update public.opportunities set owner_id = (select rep2 from ids) where id = (select id from opp);
reset role;
select is((select count(*)::int from public.activities a, ids where a.automation_key = 'owner_change' and a.owner_id = ids.rep2), 1,
  'al reasignar, el nuevo dueño recibe una tarea de revisión');
select ok((select subject like 'Revisar oportunidad reasignada: Con reglas (editada)' from public.activities where automation_key = 'owner_change'),
  'la tarea nombra la oportunidad');
select ok((select count(*) from public.audit_log where table_name = 'automation_rules') = 3, 'la configuración queda auditada');

select * from finish();
rollback;
