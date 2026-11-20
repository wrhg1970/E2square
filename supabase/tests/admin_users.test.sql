-- Administración de usuarios: rol, estado, ámbitos y protección contra auto-bloqueo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select public.bootstrap_organization('Org U', 'org-u', 'admin-u@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep-u@test.dev', r.id from public.organizations o join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-u';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin-u@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'rep-u@test.dev');
insert into public.companies (organization_id, legal_name, country_code) select id, 'Empresa U', 'MX' from public.organizations where slug = 'org-u';
insert into public.offices (organization_id, company_id, name, country_code, timezone)
select c.organization_id, c.id, 'Puebla', 'MX', 'America/Mexico_City' from public.companies c where legal_name = 'Empresa U';
create temp table ids as select
  (select id from public.profiles where email = 'admin-u@test.dev') as admin_p,
  (select id from public.profiles where email = 'rep-u@test.dev') as rep_p,
  (select r.id from public.roles r join public.organizations o on o.id = r.organization_id where o.slug = 'org-u' and r.key = 'office_manager') as manager_r,
  (select id from public.offices where name = 'Puebla') as office;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select throws_ok($$ insert into public.profile_roles (organization_id, profile_id, role_id)
  select public.current_org_id(), rep_p, manager_r from ids $$, '42501', null, 'un vendedor no se cambia de rol');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
insert into public.profile_roles (organization_id, profile_id, role_id) select public.current_org_id(), rep_p, manager_r from ids;
delete from public.profile_roles where profile_id = (select rep_p from ids) and role_id <> (select manager_r from ids);
select is((select r.key from public.profile_roles pr join public.roles r on r.id = pr.role_id where pr.profile_id = (select rep_p from ids)),
  'office_manager', 'admin cambia el rol de un usuario');

insert into public.user_scopes (organization_id, profile_id, scope_type, scope_id) select public.current_org_id(), rep_p, 'office', office from ids;
select is((select count(*)::int from public.user_scopes where profile_id = (select rep_p from ids)), 1, 'admin asigna una oficina como ámbito');

select throws_ok($$ update public.profiles set status = 'inactive' where id = public.current_profile_id() $$, 'EB001', null,
  'nadie se desactiva a sí mismo');
select throws_ok($$ delete from public.profile_roles where profile_id = public.current_profile_id() $$, 'EB001', null,
  'nadie se quita su rol de administrador');

update public.profiles set status = 'inactive' where id = (select rep_p from ids);
select is((select status from public.profiles where id = (select rep_p from ids)), 'inactive', 'admin desactiva a otro usuario');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select is(public.current_org_id(), null, 'el usuario desactivado pierde el acceso');
select is((select count(*)::int from public.profiles), 0, 'y no ve datos');

select * from finish();
rollback;
