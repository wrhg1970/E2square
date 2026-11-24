-- Secuencias de campaña: pasos editables en borrador, una tarea por paso y se detiene al abrir oportunidad.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev', 'sales_rep'), ('mkt@test.dev', 'marketing')) x(email, role_key) on true
join public.roles r on r.organization_id = o.id and r.key = x.role_key where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'mkt@test.dev');

-- Tres colegios del vendedor: uno con consentimiento, uno con contacto que pidió no contactar y uno inactivo; más una universidad.
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by, status)
select organization_id, x.name, x.t, 'MX', id, id, x.st from public.profiles,
  (values ('Colegio Uno', 'school', 'prospect'), ('Colegio Baja', 'school', 'prospect'), ('Colegio Cerrado', 'school', 'inactive'), ('Uni Norte', 'university', 'prospect')) x(name, t, st)
where email = 'rep1@test.dev';
insert into public.contacts (organization_id, first_name, email, consent_status, created_by)
select organization_id, x.n, x.e, x.c, id from public.profiles,
  (values ('Ana', 'ana@uno.mx', 'granted'), ('Beto', 'beto@baja.mx', 'revoked')) x(n, e, c)
where email = 'rep1@test.dev';
insert into public.institution_contacts (organization_id, institution_id, contact_id, is_primary)
select i.organization_id, i.id, c.id, true from public.institutions i join public.contacts c on c.organization_id = i.organization_id
where (i.name, c.email) in (('Colegio Uno', 'ana@uno.mx'), ('Colegio Baja', 'beto@baja.mx'));

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.campaigns (organization_id, name, campaign_type, start_date, owner_id)
values (public.current_org_id(), 'Feria 2027', 'fair', current_date + 1, public.current_profile_id());
create temp table camp as select id from public.campaigns;
grant select on camp to authenticated;
insert into public.campaign_steps (organization_id, campaign_id, day_offset, activity_type, subject)
select public.current_org_id(), id, x.d, x.t, x.s from camp, (values (0, 'call', 'Invitar a la feria'), (3, 'email', 'Enviar folleto'), (7, 'visit', 'Visita')) x(d, t, s);
select public.add_campaign_members((select id from camp), 'mx', array['school'], null, null);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ insert into public.campaign_steps (organization_id, campaign_id, day_offset, activity_type, subject)
  values (public.current_org_id(), (select id from camp), 1, 'call', 'Otro') $$, '42501', null, 'un vendedor no edita la secuencia');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select is(public.launch_campaign((select id from camp)), 3, 'al lanzar crea una tarea por paso e institución');
select throws_ok($$ insert into public.campaign_steps (organization_id, campaign_id, day_offset, activity_type, subject)
  values (public.current_org_id(), (select id from camp), 1, 'call', 'Tarde') $$, '42501', null, 'lanzada, la secuencia ya no cambia');
delete from public.campaign_steps;
select is((select count(*)::int from public.campaign_steps), 3, 'tampoco se borran pasos');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select results_eq($$ select activity_type, subject, public.local_date(due_at) - current_date from public.activities order by due_at $$,
  $$ values ('call'::text, 'Campaña: Feria 2027 · Invitar a la feria'::text, 1), ('email', 'Campaña: Feria 2027 · Enviar folleto', 4),
            ('visit', 'Campaña: Feria 2027 · Visita', 8) $$,
  'tareas para el responsable, con tipo, asunto y fecha de cada paso');
select is(((public.campaign_results((select id from camp)))->>'tasks_pending')::int, 3, 'cuenta las tareas pendientes de la secuencia');

-- La institución abre una oportunidad de la campaña: se cancelan los pasos que faltan.
reset role;
insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, source_campaign_id, created_by)
select i.organization_id, i.id, p.default_pipeline_id, (select id from public.pipeline_stages s where s.pipeline_id = p.default_pipeline_id and s.name = 'Lead'),
  'Venta feria', i.owner_id, 'MXN', (select id from camp), i.owner_id
from public.institutions i, public.products p where i.name = 'Colegio Uno' and p.organization_id = i.organization_id and p.code = 'TOEFL';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.activities where status = 'cancelled' and campaign_id is not null), 3,
  'abrir una oportunidad de la campaña detiene la secuencia de esa institución');
select is(((public.campaign_results((select id from camp)))->>'tasks_pending')::int, 0, 'ya no hay tareas pendientes');

select * from finish();
rollback;
