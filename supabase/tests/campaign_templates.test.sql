-- Plantillas de campaña: sin audiencia, no se lanzan, no cambian de tipo y se copian con su secuencia.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'mkt@test.dev', r.id from public.organizations o join public.roles r on r.organization_id = o.id and r.key = 'marketing'
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'mkt@test.dev');
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
select organization_id, 'Colegio Uno', 'school', 'MX', id, id from public.profiles where email = 'admin-a@test.dev';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.campaigns (organization_id, name, campaign_type, start_date, owner_id, is_template, lead_goal)
values (public.current_org_id(), 'Plantilla feria', 'fair', current_date, public.current_profile_id(), true, 20);
create temp table tpl as select id from public.campaigns;
grant select on tpl to authenticated;
insert into public.campaign_steps (organization_id, campaign_id, day_offset, activity_type, subject)
select public.current_org_id(), id, x.d, x.t, x.s from tpl, (values (0, 'call', 'Invitar'), (3, 'email', 'Folleto')) x(d, t, s);

select throws_ok($$ select public.add_campaign_members((select id from tpl), 'MX', null, null, null) $$, 'EB001', null,
  'una plantilla no lleva audiencia');
select throws_ok($$ select public.launch_campaign((select id from tpl)) $$, 'EB001', null, 'una plantilla no se lanza');
select throws_ok($$ update public.campaigns set is_template = false where id = (select id from tpl) $$, 'EB001', null,
  'una plantilla no se convierte en campaña');

-- Copia como hace la app: campaña nueva en borrador y los pasos de la plantilla en un solo insert.
insert into public.campaigns (organization_id, name, campaign_type, start_date, owner_id, lead_goal)
values (public.current_org_id(), 'Feria 2027', 'fair', current_date + 1, public.current_profile_id(), 20);
create temp table copia as select id from public.campaigns where not is_template;
grant select on copia to authenticated;
select lives_ok($$ insert into public.campaign_steps (organization_id, campaign_id, day_offset, activity_type, subject)
  select organization_id, (select id from copia), day_offset, activity_type, subject from public.campaign_steps where campaign_id = (select id from tpl) $$,
  'la secuencia se copia a la campaña nueva');
select is((select count(*)::int from public.campaign_steps where campaign_id = (select id from copia)), 2, 'trae los dos pasos');
select is(public.add_campaign_members((select id from copia), 'MX', null, null, null), 1, 'la copia sí lleva audiencia');
select is(public.launch_campaign((select id from copia)), 2, 'y se lanza con la secuencia copiada');

delete from public.campaigns where id = (select id from tpl);
select is((select count(*)::int from public.campaigns), 1, 'la plantilla se borra sin tocar la campaña creada con ella');

select * from finish();
rollback;
