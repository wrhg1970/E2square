-- Documentos con vigencia: generales de la empresa, edición limitada y herencia en versiones.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select public.bootstrap_organization('Org V', 'org-v', 'admin-v@test.dev');
select public.bootstrap_organization('Org W', 'org-w', 'admin-w@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1-v@test.dev', 'sales_rep'), ('rep2-v@test.dev', 'sales_rep'), ('mkt-v@test.dev', 'marketing')) x(email, role_key) on true
join public.roles r on r.organization_id = o.id and r.key = x.role_key where o.slug = 'org-v';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001f1', 'rep1-v@test.dev'),
  ('00000000-0000-0000-0000-0000000001f2', 'rep2-v@test.dev'),
  ('00000000-0000-0000-0000-0000000001f3', 'mkt-v@test.dev'),
  ('00000000-0000-0000-0000-0000000001f9', 'admin-w@test.dev');
create temp table org as select id from public.organizations where slug = 'org-v';
grant select on org to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f1', true);
select lives_ok($$ insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, category, title, expires_on, uploaded_by)
  values (public.current_org_id(), (select id from org) || '/rfc.pdf', 'rfc.pdf', 'application/pdf', 10, 'legal', 'Constancia fiscal', '2027-01-31', public.current_profile_id()) $$,
  'un vendedor sube un documento general de la empresa');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f3', true);
select throws_ok($$ insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (public.current_org_id(), (select id from org) || '/x.pdf', 'x.pdf', 'application/pdf', 1, public.current_profile_id()) $$,
  '42501', null, 'sin permiso de escritura no se suben documentos generales');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f2', true);
select is((select count(*)::int from public.documents), 1, 'toda la organización ve los documentos generales');
update public.documents set title = 'Cambiado' where file_name = 'rfc.pdf';
select is((select title from public.documents), 'Constancia fiscal', 'otro vendedor no edita lo que no subió');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f1', true);
update public.documents set title = 'Constancia de situación fiscal', expires_on = '2027-02-28', category = 'legal' where file_name = 'rfc.pdf';
select is((select title || ' ' || expires_on from public.documents), 'Constancia de situación fiscal 2027-02-28', 'quien lo subió edita título y vigencia');
select throws_ok($$ update public.documents set storage_path = 'otra/ruta.pdf' $$, '42501', null, 'el archivo y los vínculos no se editan');
select throws_ok($$ update public.documents set category = 'pasaporte' $$, '23514', null, 'la categoría debe ser válida');

insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, root_id, uploaded_by)
values (public.current_org_id(), (select id from org) || '/rfc2.pdf', 'rfc2.pdf', 'application/pdf', 10,
  (select root_id from public.documents where file_name = 'rfc.pdf'), public.current_profile_id());
select is((select version || ' ' || title || ' ' || expires_on from public.documents where file_name = 'rfc2.pdf'),
  '2 Constancia de situación fiscal 2027-02-28', 'la nueva versión hereda título y vigencia');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001f9', true);
select is((select count(*)::int from public.documents), 0, 'otra organización no ve documentos generales');

select * from finish();
rollback;
