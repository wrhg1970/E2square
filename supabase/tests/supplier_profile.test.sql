-- Ficha del proveedor: datos, contactos y logo. Lo ve toda la organización; lo cambia solo catalog.manage.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select public.bootstrap_organization('Org P', 'org-p', 'admin-p@test.dev');
select public.bootstrap_organization('Org Q', 'org-q', 'admin-q@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep-p@test.dev', r.id from public.organizations o join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-p';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a0', 'admin-p@test.dev'),
  ('00000000-0000-0000-0000-0000000000a1', 'rep-p@test.dev'),
  ('00000000-0000-0000-0000-0000000000b0', 'admin-q@test.dev');
create temp table orgs as select (select id from public.organizations where slug = 'org-p') as p;
grant select on orgs to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a0', true);
update public.products set legal_name = 'Educational Testing Service', city = 'Princeton', email = 'ventas@ets.org' where code = 'TOEFL';
select is((select city from public.products where code = 'TOEFL'), 'Princeton', 'el administrador guarda los datos del proveedor');
select throws_ok($$ update public.products set email = 'Ventas@ETS.org' where code = 'TOEFL' $$, '23514', null, 'el correo se guarda en minúsculas');

insert into public.supplier_contacts (organization_id, supplier_id, name, job_title, is_primary)
select public.current_org_id(), id, 'Ana Gómez', 'Gerente de cuenta', true from public.products where code = 'TOEFL';
select throws_ok($$ insert into public.supplier_contacts (organization_id, supplier_id, name, is_primary)
  select public.current_org_id(), id, 'Otro', true from public.products where code = 'TOEFL' $$,
  '23505', null, 'solo un contacto principal por proveedor');
insert into public.products (organization_id, code, name, supplier_id)
select public.current_org_id(), 'TOEFL-ITP', 'TOEFL ITP', id from public.products where code = 'TOEFL';
select throws_ok($$ insert into public.supplier_contacts (organization_id, supplier_id, name)
  select public.current_org_id(), id, 'Luis' from public.products where code = 'TOEFL-ITP' $$,
  'EB001', null, 'los contactos son del proveedor, no del producto');

insert into storage.objects (bucket_id, name, owner_id) values ('logos', (select p from orgs) || '/logo.png', auth.uid()::text);
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 1, 'el administrador sube el logo en la carpeta de su organización');

-- Vendedor: lee todo, no cambia nada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.supplier_contacts), 1, 'el vendedor ve los contactos del proveedor');
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 1, 'y el logo');
select throws_ok($$ insert into public.supplier_contacts (organization_id, supplier_id, name)
  select public.current_org_id(), id, 'Intruso' from public.products where code = 'TOEFL' $$,
  '42501', null, 'el vendedor no agrega contactos');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('logos', (select p from orgs) || '/otro.png', auth.uid()::text) $$,
  '42501', null, 'ni sube logos');

-- Otra organización no ve nada.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b0', true);
select is((select count(*)::int from public.supplier_contacts) + (select count(*)::int from storage.objects where bucket_id = 'logos'), 0,
  'otra organización no ve contactos ni logos');

select * from finish();
rollback;
