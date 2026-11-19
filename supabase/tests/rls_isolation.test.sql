-- Pruebas de aislamiento multiempresa y permisos (Fase 1).
-- Con Supabase local: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------- Datos de prueba (como superusuario) ----------
select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'viewer-a@test.dev', r.id
from public.organizations o join public.roles r on r.organization_id = o.id and r.key = 'viewer'
where o.slug = 'org-a';

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'Admin-A@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000d', 'intruso@test.dev');

insert into public.companies (organization_id, legal_name, country_code)
select id, 'Empresa ' || name, 'MX' from public.organizations where slug in ('org-a', 'org-b');

select is((select count(*)::int from public.profiles where email like '%@test.dev'), 3, 'solo los correos invitados obtienen perfil');
select ok(exists (select 1 from public.profiles where email = 'admin-a@test.dev'), 'la invitación ignora mayúsculas del correo');
select ok((select count(*) = 0 from public.invitations where email like '%@test.dev' and accepted_at is null), 'las invitaciones quedan aceptadas');

select throws_ok(
  $$ insert into public.business_units (organization_id, company_id, name)
     select (select id from public.organizations where slug = 'org-b'), c.id, 'Cruzada'
     from public.companies c join public.organizations o on o.id = c.organization_id where o.slug = 'org-a' $$,
  '23503', null, 'una unidad no puede colgar de una empresa de otra organización');

select throws_ok(
  $$ insert into public.user_scopes (organization_id, profile_id, scope_type, scope_id)
     select p.organization_id, p.id, 'company', (select c.id from public.companies c join public.organizations o on o.id = c.organization_id where o.slug = 'org-b')
     from public.profiles p where p.email = 'admin-a@test.dev' $$,
  'P0001', null, 'un ámbito no puede apuntar a otra organización');

-- ---------- Administrador de A ----------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select is((select count(*)::int from public.organizations), 1, 'admin A ve solo su organización');
select is((select count(*)::int from public.companies), 1, 'admin A ve solo empresas de A');
select is((select count(*)::int from public.profiles), 2, 'admin A ve solo usuarios de A');
select ok(public.has_permission('admin.structure'), 'admin A tiene permiso de estructura');

insert into public.companies (organization_id, legal_name, country_code) values (public.current_org_id(), 'Nueva A', 'CO');
select ok(exists (select 1 from public.companies where legal_name = 'Nueva A'), 'admin A crea empresas en A');

select throws_ok(
  $$ insert into public.companies (organization_id, legal_name, country_code)
     values ((select id from public.organizations where slug = 'org-b'), 'Infiltrada', 'MX') $$,
  '42501', null, 'admin A no crea empresas en B');

select throws_ok(
  $$ insert into public.companies (organization_id, legal_name, country_code)
     values ('00000000-0000-0000-0000-0000000000ff', 'Adivinada', 'MX') $$,
  '42501', null, 'admin A no escribe con un organization_id inventado');

select is((select count(*)::int from public.audit_log where table_name = 'companies' and record_id is not null), 2,
  'la auditoría registra las empresas de A y nada de B');

-- ---------- Consulta de A ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select is((select count(*)::int from public.companies), 2, 'consulta de A lee empresas de A');
select throws_ok(
  $$ insert into public.companies (organization_id, legal_name, country_code) values (public.current_org_id(), 'No', 'MX') $$,
  '42501', null, 'consulta de A no puede crear empresas');
select is((select count(*)::int from public.audit_log), 0, 'consulta de A no lee la auditoría');
select throws_ok(
  $$ insert into public.profile_roles (organization_id, profile_id, role_id)
     select public.current_org_id(), public.current_profile_id(), id from public.roles where key = 'admin' $$,
  '42501', null, 'consulta de A no puede darse rol de administrador');

-- ---------- Administrador de B ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.companies), 1, 'admin B no ve empresas de A');

-- ---------- Usuario no invitado y anónimo ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
select is((select count(*)::int from public.companies) + (select count(*)::int from public.organizations), 0, 'usuario sin invitación no ve nada');

set local role anon;
select is((select count(*)::int from public.companies), 0, 'anónimo no ve nada');

select * from finish();
rollback;
