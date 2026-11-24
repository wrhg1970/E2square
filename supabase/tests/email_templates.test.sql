-- Plantillas de correo: iniciales por organización, aislamiento y quién edita.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1@test.dev'), ('rep2@test.dev')) x(email) on true
join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.email_templates), 7, 'cada organización nueva trae las plantillas iniciales y solo ve las suyas');

insert into public.email_templates (organization_id, category, title, subject, body, created_by)
values (public.current_org_id(), 'proposal', 'Mía', 'Asunto', 'Texto', public.current_profile_id());
select throws_ok($$ insert into public.email_templates (organization_id, category, title, subject, body, created_by)
  values (public.current_org_id(), 'proposal', 'Ajena', 'Asunto', 'Texto', null) $$, '42501', null, 'no se crea a nombre de otro');
select throws_ok($$ insert into public.email_templates (organization_id, category, title, subject, body, created_by)
  values (public.current_org_id(), 'otra', 'Mala', 'Asunto', 'Texto', public.current_profile_id()) $$, '23514', null, 'categoría válida');

update public.email_templates set title = 'Mía editada' where title = 'Mía';
select is((select count(*)::int from public.email_templates where title = 'Mía editada'), 1, 'el autor edita la suya');
update public.email_templates set title = 'Hackeada' where created_by is null;
select is((select count(*)::int from public.email_templates where title = 'Hackeada'), 0, 'un vendedor no edita las iniciales');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
delete from public.email_templates where title = 'Mía editada';
select is((select count(*)::int from public.email_templates where title = 'Mía editada'), 1, 'otro vendedor no borra plantillas ajenas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update public.email_templates set title = 'Ajustada por admin', created_by = public.current_profile_id() where title = 'Mía editada';
select is((select created_by from public.email_templates where title = 'Ajustada por admin'),
  (select id from public.profiles where email = 'rep1@test.dev'), 'el admin edita cualquiera sin cambiar el autor');
delete from public.email_templates where category = 'customer';
select is((select count(*)::int from public.email_templates where category = 'customer'), 0, 'el admin borra las iniciales');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.email_templates where category = 'customer'), 1, 'la otra organización conserva las suyas');

select * from finish();
rollback;
