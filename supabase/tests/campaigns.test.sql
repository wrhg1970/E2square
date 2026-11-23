-- Campañas (Fase 6d): permisos, audiencia con consentimiento, lanzamiento con tareas, atribución y ROI.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ insert into public.campaigns (organization_id, name, campaign_type, start_date, owner_id)
  values (public.current_org_id(), 'No', 'email', current_date, public.current_profile_id()) $$, '42501', null, 'un vendedor no crea campañas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.campaigns (organization_id, name, campaign_type, start_date, owner_id, actual_cost, currency_code)
values (public.current_org_id(), 'Regreso a clases', 'email', current_date, public.current_profile_id(), 1000, 'MXN');
create temp table camp as select id from public.campaigns;
grant select on camp to authenticated;
select is(public.add_campaign_members((select id from camp), 'mx', array['school'], null, null), 1,
  'el segmento de colegios deja fuera al inactivo y al que pidió no contactar');
select is((select consent_basis from public.campaign_members), 'granted', 'registra la base de consentimiento del contacto');
select throws_ok($$ update public.campaigns set status = 'active' $$, 'EB001', 'Usa "Lanzar campaña" para activarla.', 'no se activa a mano');
select is(public.launch_campaign((select id from camp)), 1, 'al lanzar crea una tarea por institución');
select throws_ok($$ select public.launch_campaign((select id from camp)) $$, 'EB001', null, 'no se lanza dos veces');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.activities where subject = 'Campaña: Regreso a clases' and status = 'pending'), 1,
  'la tarea le llega al responsable de la institución');
select is((select (public.campaign_results((select id from camp)))->>'members'), '1', 'el vendedor ve los resultados de su cartera');

-- Oportunidad atribuida a la campaña y ganada.
reset role;
insert into public.opportunities (organization_id, institution_id, pipeline_id, stage_id, name, owner_id, currency_code, amount, cost, probability, source_campaign_id, created_by, expected_close_date)
select i.organization_id, i.id, p.default_pipeline_id, (select id from public.pipeline_stages s where s.pipeline_id = p.default_pipeline_id and s.name = 'Lead'),
  'Venta campaña', i.owner_id, 'MXN', 5000, 2000, 10, (select id from camp), i.owner_id, current_date
from public.institutions i, public.products p where i.name = 'Colegio Uno' and p.organization_id = i.organization_id and p.code = 'TOEFL';
update public.opportunities set stage_id = (select s.id from public.pipeline_stages s join public.opportunities o on o.pipeline_id = s.pipeline_id where o.name = 'Venta campaña' and s.name = 'Ganada')
where name = 'Venta campaña';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select is((select r->>'won_margin' || ' · ' || (r->>'roi_pct') from (select public.campaign_results((select id from camp)) r) x), '3000.0000 · 200.0',
  'ROI = (margen ganado 3000 − costo 1000) / 1000 = 200%');
delete from public.campaign_members;
select is((select count(*)::int from public.campaign_members), 1, 'tras lanzar no se borra la audiencia');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.campaigns) + (select count(*)::int from public.campaign_members), 0, 'otra organización no ve campañas ajenas');
select throws_ok($$ select public.add_campaign_members((select id from camp), null, null, null, null) $$, 'EB001', 'Campaña no encontrada.',
  'otra organización no agrega audiencia a campañas ajenas');

select * from finish();
rollback;
