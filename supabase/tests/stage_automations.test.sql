-- Pruebas de automatizaciones por producto y etapa.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep1@test.dev', r.id from public.organizations o
join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev');

create temp table ids as
select p.default_pipeline_id as pipeline,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Lead') as lead,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id and name = 'Calificado') as proposal,
  (select s.id from public.pipeline_stages s join public.products q on q.default_pipeline_id = s.pipeline_id
   where q.organization_id = o.id and q.code = 'IHS' and s.name = 'Calificado') as ihs_proposal
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
select throws_ok($$ insert into public.stage_automation_rules (organization_id, stage_id, activity_type, subject)
  select public.current_org_id(), lead, 'call', 'Llamar' from ids $$, '42501', null, 'un vendedor no da de alta automatizaciones');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select throws_ok($$ insert into public.stage_automation_rules (organization_id, stage_id, activity_type, subject)
  select public.current_org_id(), lead, 'call', 'Llamar' from ids $$, '23503', null, 'no se puede usar una etapa de otra organización');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.stage_automation_rules (organization_id, stage_id, activity_type, subject, days)
select public.current_org_id(), lead, 'call', 'Primera llamada TOEFL', 1 from ids
union all select public.current_org_id(), proposal, 'follow_up', 'Seguimiento a calificado', 3 from ids
union all select public.current_org_id(), ihs_proposal, 'visit', 'Visita IHS', 2 from ids;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
create temp table opp as select pg_temp.new_opp('Colegio Sol') as id;
select is((select (activity_type, subject, due_at::date = (now() + interval '1 day')::date)::text from public.activities where opportunity_id = (select id from opp)),
  '(call,"Primera llamada TOEFL: Colegio Sol",t)', 'al crearse en Lead se programa la tarea de esa etapa');

update public.opportunities set stage_id = (select proposal from ids) where id = (select id from opp);
select is((select (activity_type, due_at::date = (now() + interval '3 days')::date)::text from public.activities
           where opportunity_id = (select id from opp) and subject like 'Seguimiento%'),
  '(follow_up,t)', 'al pasar a Calificado de TOEFL se programa su seguimiento');
select is((select count(*)::int from public.activities where subject like 'Visita IHS%'), 0, 'la regla de otro producto no aplica');

update public.opportunities set stage_id = (select lead from ids) where id = (select id from opp);
select is((select count(*)::int from public.activities where opportunity_id = (select id from opp)), 2,
  'regresar a una etapa con tarea pendiente no la duplica');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.stage_automation_rules set enabled = false;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select pg_temp.new_opp('Colegio Luna');
select is((select count(*)::int from public.activities where subject like '%Colegio Luna'), 0, 'una regla apagada no crea tareas');

reset role;
select ok((select count(*) from public.audit_log where table_name = 'stage_automation_rules') >= 4, 'altas y cambios quedan auditados');

select * from finish();
rollback;
