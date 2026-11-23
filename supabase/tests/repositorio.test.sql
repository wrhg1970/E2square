-- Repositorio (Fase 7): documentos de campaña, permisos por tipo de vínculo y versiones.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select public.bootstrap_organization('Org R', 'org-r', 'admin-r@test.dev');
select public.bootstrap_organization('Org S', 'org-s', 'admin-s@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id from public.organizations o
join (values ('rep1-r@test.dev', 'sales_rep'), ('rep2-r@test.dev', 'sales_rep'), ('mkt-r@test.dev', 'marketing')) x(email, role_key) on true
join public.roles r on r.organization_id = o.id and r.key = x.role_key where o.slug = 'org-r';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f0', 'admin-r@test.dev'),
  ('00000000-0000-0000-0000-0000000000f1', 'rep1-r@test.dev'),
  ('00000000-0000-0000-0000-0000000000f2', 'rep2-r@test.dev'),
  ('00000000-0000-0000-0000-0000000000f3', 'mkt-r@test.dev'),
  ('00000000-0000-0000-0000-0000000000f9', 'admin-s@test.dev');
create temp table org as select id from public.organizations where slug = 'org-r';
grant select on org to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', true);
insert into public.campaigns (organization_id, name, campaign_type, start_date, owner_id)
values (public.current_org_id(), 'Feria', 'fair', current_date, public.current_profile_id());
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('documents', (select id from org) || '/c1-folleto.pdf', auth.uid()::text) $$,
  'marketing sube archivos aunque no edite instituciones');
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, category, campaign_id, uploaded_by)
values (public.current_org_id(), (select id from org) || '/c1-folleto.pdf', 'folleto.pdf', 'application/pdf', 100, 'material',
  (select id from public.campaigns), public.current_profile_id());
select is((select version from public.documents), 1, 'el primer documento es la versión 1');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select is((select count(*)::int from public.documents where campaign_id is not null), 1, 'el vendedor ve los documentos de campaña');
select throws_ok($$ insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, campaign_id, uploaded_by)
  values (public.current_org_id(), (select id from org) || '/x.pdf', 'x.pdf', 'application/pdf', 1, (select id from public.campaigns), public.current_profile_id()) $$,
  '42501', null, 'el vendedor no sube documentos a campañas');
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Versiones', 'school', 'MX', public.current_profile_id(), public.current_profile_id());
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, category, institution_id, uploaded_by)
values (public.current_org_id(), (select id from org) || '/p1.pdf', 'propuesta.pdf', 'application/pdf', 10, 'proposal',
  (select id from public.institutions), public.current_profile_id());
-- Nueva versión: no hace falta repetir vínculos ni categoría.
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, root_id, uploaded_by)
values (public.current_org_id(), (select id from org) || '/p2.pdf', 'propuesta v2.pdf', 'application/pdf', 20,
  (select root_id from public.documents where file_name = 'propuesta.pdf'), public.current_profile_id());
select is((select version || ' ' || category || ' ' || (institution_id is not null) from public.documents where file_name = 'propuesta v2.pdf'),
  '2 proposal true', 'la nueva versión toma el número siguiente y hereda vínculo y categoría');
select is((select count(*)::int from public.documents where file_name like 'propuesta%'), 2, 'la versión anterior se conserva');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
reset role;
create temp table root as select root_id from public.documents where file_name = 'propuesta.pdf';
grant select on root to authenticated;
set local role authenticated;
select throws_ok($$ insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, root_id, uploaded_by)
  values (public.current_org_id(), (select id from org) || '/p3.pdf', 'robo.pdf', 'application/pdf', 1, (select root_id from root), public.current_profile_id()) $$,
  'EB001', 'El documento original no existe o no lo puedes ver.', 'no se versiona un documento que no ves');
select is((select count(*)::int from public.documents where institution_id is not null), 0, 'otro vendedor no ve documentos de instituciones ajenas');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);
select is((select count(*)::int from public.documents), 0, 'otra organización no ve documentos de campaña ni de proveedor');

select * from finish();
rollback;
