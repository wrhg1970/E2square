-- Documentos privados: el registro y el archivo solo los ve quien ve la institución/oportunidad.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select public.bootstrap_organization('Org D', 'org-d', 'admin-d@test.dev');
select public.bootstrap_organization('Org X', 'org-x', 'admin-x@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1-d@test.dev', 'sales_rep'), ('rep2-d@test.dev', 'sales_rep'), ('viewer-d@test.dev', 'viewer')) x(email, role) on true
join public.roles r on r.organization_id = o.id and r.key = x.role where o.slug = 'org-d';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d0', 'admin-d@test.dev'),
  ('00000000-0000-0000-0000-0000000000d1', 'rep1-d@test.dev'),
  ('00000000-0000-0000-0000-0000000000d2', 'rep2-d@test.dev'),
  ('00000000-0000-0000-0000-0000000000d3', 'viewer-d@test.dev'),
  ('00000000-0000-0000-0000-0000000000e0', 'admin-x@test.dev');
create temp table orgs as select (select id from public.organizations where slug = 'org-d') as d, (select id from public.organizations where slug = 'org-x') as x;
grant select on orgs to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Docs', 'school', 'MX', public.current_profile_id(), public.current_profile_id());
insert into storage.objects (bucket_id, name, owner_id) values ('documents', (select d from orgs) || '/a1-propuesta.pdf', auth.uid()::text);
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, category, institution_id, uploaded_by)
select public.current_org_id(), (select d from orgs) || '/a1-propuesta.pdf', 'propuesta.pdf', 'application/pdf', 1000, 'proposal', id, public.current_profile_id()
from public.institutions where name = 'Colegio Docs';
select is((select count(*)::int from storage.objects), 1, 'el dueño de la cartera ve el archivo');

select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', (select x from orgs) || '/intruso.pdf', auth.uid()::text) $$,
  '42501', null, 'no se sube a la carpeta de otra organización');
select throws_ok($$ insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (public.current_org_id(), (select x from orgs) || '/suelto.pdf', 'suelto.pdf', 'application/pdf', 10, public.current_profile_id()) $$,
  '23514', null, 'un documento sin vínculo (general) tampoco sale de la carpeta de su organización');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
select is((select count(*)::int from public.documents), 0, 'otro vendedor no ve el documento');
select is((select count(*)::int from storage.objects), 0, 'ni puede leer (o firmar) el archivo');
delete from storage.objects where bucket_id = 'documents';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d0', true);
select is((select count(*)::int from storage.objects), 1, 'otro vendedor no puede borrar el archivo ajeno');
select is((select count(*)::int from public.documents), 1, 'admin ve el documento');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', true);
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', (select d from orgs) || '/consulta.pdf', auth.uid()::text) $$,
  '42501', null, 'consulta no sube archivos');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e0', true);
select is((select count(*)::int from storage.objects), 0, 'otra organización no ve el archivo');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
delete from public.documents;
delete from storage.objects where bucket_id = 'documents';
reset role;
select is((select count(*)::int from storage.objects), 0, 'quien lo subió lo borra (registro y archivo)');

select * from finish();
rollback;
