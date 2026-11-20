-- Pruebas de actividades, Mi día y regla de próxima actividad (Fase 4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev', 'sales_rep'), ('rep2@test.dev', 'sales_rep'), ('viewer@test.dev', 'viewer')) x(email, role) on true
join public.roles r on r.organization_id = o.id and r.key = x.role
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev'),
  ('00000000-0000-0000-0000-000000000003', 'viewer@test.dev');

-- Institución de otro vendedor, para probar cruces.
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
select organization_id, 'Uni Ajena', 'university', 'MX', id, id from public.profiles where email = 'rep2@test.dev';
create temp table other as select id from public.institutions where name = 'Uni Ajena';
grant select on other to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Sol', 'school', 'MX', public.current_profile_id(), public.current_profile_id());
insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, probability, created_by)
select public.current_org_id(), i.id, p.default_pipeline_id,
  (select id from public.pipeline_stages where pipeline_id = p.default_pipeline_id order by sort_order limit 1),
  'IHS 2027', public.current_profile_id(), 'USD', 0, public.current_profile_id()
from public.institutions i, public.products p where i.name = 'Colegio Sol' and p.code = 'IHS' and p.organization_id = public.current_org_id();

insert into public.activities (organization_id, activity_type, subject, opportunity_id, owner_id, due_at, created_by)
select public.current_org_id(), 'call', 'Llamada de descubrimiento', id, public.current_profile_id(), now() - interval '1 day', public.current_profile_id()
from public.opportunities;

select ok((select institution_id is not null from public.activities), 'la actividad hereda la institución de la oportunidad');
select ok((select next_activity_at is not null from public.opportunities), 'la oportunidad registra su próxima actividad');

select throws_ok($$ update public.activities set status = 'done' $$, 'EB001', null,
  'no se cierra la única actividad de una oportunidad abierta sin programar otra');

insert into public.activities (organization_id, activity_type, subject, opportunity_id, owner_id, due_at, created_by)
select public.current_org_id(), 'meeting', 'Presentación', id, public.current_profile_id(), now() + interval '2 days', public.current_profile_id()
from public.opportunities;
update public.activities set status = 'done', outcome = 'Interesados' where subject = 'Llamada de descubrimiento';

select ok((select completed_at is not null from public.activities where subject = 'Llamada de descubrimiento'), 'al completar se registra la fecha');
select ok((select last_activity_at is not null and next_activity_at > now() from public.institutions), 'la institución muestra última interacción y próxima actividad');

select throws_ok(
  $$ insert into public.activities (organization_id, activity_type, subject, institution_id, opportunity_id, owner_id, created_by)
     values (public.current_org_id(), 'call', 'Cruzada',
             (select id from other), (select id from public.opportunities limit 1),
             public.current_profile_id(), public.current_profile_id()) $$,
  null, null, 'la actividad no puede mezclar institución y oportunidad distintas');

-- Sin la regla, se puede cerrar la última.
reset role;
update public.organizations set require_next_activity = false where slug = 'org-a';
set local role authenticated;
update public.activities set status = 'done' where subject = 'Presentación';
select is((select count(*)::int from public.activities where status = 'done'), 2, 'con la regla apagada se cierra sin siguiente');

select throws_ok(
  $$ insert into public.activities (organization_id, activity_type, subject, institution_id, owner_id, created_by)
     values (public.current_org_id(), 'call', 'Intrusa', (select id from other), public.current_profile_id(), public.current_profile_id()) $$,
  '42501', null, 'no registra actividades en instituciones que no ve');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.activities), 0, 'otro vendedor no ve actividades ajenas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ insert into public.activities (organization_id, activity_type, subject, owner_id, created_by)
     values (public.current_org_id(), 'internal_task', 'Tarea', public.current_profile_id(), public.current_profile_id()) $$,
  '42501', null, 'consulta no registra actividades');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select count(*)::int from public.activities), 2, 'admin ve las actividades');

select * from finish();
rollback;
