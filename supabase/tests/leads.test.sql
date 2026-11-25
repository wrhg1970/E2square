-- Pruebas de prospectos (leads de Meta): visibilidad, permisos y que un Lead ID no se repita.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep1@test.dev', r.id from public.organizations o
join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select lives_ok($$ insert into public.leads (organization_id, external_id, full_name, email, created_by, owner_id)
  values (public.current_org_id(), '1000000000000001', 'Ana Prueba', 'ana@test.dev', public.current_profile_id(), public.current_profile_id()) $$,
  'el admin importa un prospecto');
select throws_ok($$ insert into public.leads (organization_id, external_id, full_name, created_by)
  values (public.current_org_id(), '1000000000000001', 'Otra vez', public.current_profile_id()) $$,
  '23505', null, 'el mismo Lead ID no se importa dos veces');
update public.leads set status = 'contacting', external_id = 'x', notes = 'Llamar el lunes';
select is((select external_id || '|' || status from public.leads), '1000000000000001|contacting', 'se edita el estatus pero no el Lead ID');
select is((select count(*)::int from public.audit_log where table_name = 'leads'), 2, 'alta y cambio quedan en auditoría');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::int from public.leads), 0, 'un vendedor no ve prospectos ajenos');
select throws_ok($$ insert into public.leads (organization_id, full_name, created_by)
  values (public.current_org_id(), 'Sin permiso', public.current_profile_id()) $$, '42501', null, 'sin permiso de importar no da de alta');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.leads), 0, 'otra organización no ve los prospectos');

select * from finish();
rollback;
