-- Pruebas de conexiones de Google y correos registrados (Fase 6a).
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
create temp table ids as select (select id from public.profiles where email = 'rep2@test.dev') as rep2;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.google_connections (organization_id, profile_id, google_email, refresh_token_enc, scopes)
values (public.current_org_id(), public.current_profile_id(), 'rep1@e2.mx', 'cifrado', 'gmail.readonly');
select is((select count(*)::int from public.google_connections), 1, 'el usuario ve su propia conexión');
select throws_ok($$ insert into public.google_connections (organization_id, profile_id, google_email, refresh_token_enc, scopes)
  select public.current_org_id(), rep2, 'x@e2.mx', 'x', 'x' from ids $$, '42501', null, 'nadie registra una conexión a nombre de otro');

insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Sol', 'school', 'MX', public.current_profile_id(), public.current_profile_id());
insert into public.contacts (organization_id, first_name, last_name, email, created_by)
values (public.current_org_id(), 'Ana', 'Pérez', 'ana@sol.mx', public.current_profile_id());
insert into public.communications (organization_id, owner_id, direction, external_id, subject, from_email, sent_at, contact_id, institution_id)
select public.current_org_id(), public.current_profile_id(), 'inbound', 'm1', 'Propuesta', 'ana@sol.mx', now(),
       (select id from public.contacts), (select id from public.institutions);
select is((select count(*)::int from public.communications), 1, 'el vendedor registra un correo de su institución');
select throws_ok($$ insert into public.communications (organization_id, owner_id, direction, external_id, from_email, sent_at)
  select public.current_org_id(), rep2, 'inbound', 'm2', 'x@y.mx', now() from ids $$, '42501', null, 'no registra correos a nombre de otro');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.google_connections), 0, 'otro vendedor no ve conexiones ajenas');
select is((select count(*)::int from public.communications), 0, 'ni correos de instituciones que no ve');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select count(*)::int from public.google_connections), 0, 'ni el administrador lee tokens ajenos');
select is((select count(*)::int from public.communications), 1, 'quien ve la institución ve sus correos');

select * from finish();
rollback;
