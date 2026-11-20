-- Pruebas de cartera, contactos y duplicados (Fase 2).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------- Datos (superusuario) ----------
select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, x.email, r.id
from public.organizations o
join (values ('rep1@test.dev', 'sales_rep'), ('rep2@test.dev', 'sales_rep'), ('mgr@test.dev', 'office_manager')) x(email, role) on true
join public.roles r on r.organization_id = o.id and r.key = x.role
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'rep2@test.dev'),
  ('00000000-0000-0000-0000-000000000003', 'mgr@test.dev');

insert into public.companies (organization_id, legal_name, country_code)
select id, 'Empresa A', 'MX' from public.organizations where slug = 'org-a';
insert into public.offices (organization_id, company_id, name, country_code)
select c.organization_id, c.id, x.n, 'MX' from public.companies c, (values ('CDMX'), ('GDL')) x(n) where c.legal_name = 'Empresa A';

-- Instituciones: una de rep1 en CDMX, una de rep2 en GDL.
insert into public.institutions (organization_id, name, institution_type, country_code, website, phone, office_id, owner_id, created_by)
select p.organization_id, x.name, 'school', 'MX', x.web, x.phone, o.id, p.id, p.id
from (values ('rep1@test.dev', 'Colegio Álamo', 'https://www.colegioalamo.edu.mx/inicio', '+52 55 1234 5678', 'CDMX'),
             ('rep2@test.dev', 'Universidad Del Norte', null, null, 'GDL')) x(email, name, web, phone, office)
join public.profiles p on p.email = x.email
join public.offices o on o.name = x.office and o.organization_id = p.organization_id;

-- Gerente con ámbito sobre la oficina CDMX.
insert into public.user_scopes (organization_id, profile_id, scope_type, scope_id)
select p.organization_id, p.id, 'office', o.id from public.profiles p join public.offices o on o.name = 'CDMX' and o.organization_id = p.organization_id
where p.email = 'mgr@test.dev';

-- Contacto de la institución de rep1.
insert into public.contacts (organization_id, first_name, last_name, email, created_by)
select organization_id, 'Ana', 'Pérez', 'ana@alamo.mx', id from public.profiles where email = 'rep1@test.dev';
insert into public.institution_contacts (organization_id, institution_id, contact_id, decision_role, is_primary)
select i.organization_id, i.id, c.id, 'decision_maker', true from public.institutions i, public.contacts c
where i.name = 'Colegio Álamo' and c.email = 'ana@alamo.mx';

select is((select normalized_name from public.institutions where name = 'Colegio Álamo'), 'colegio alamo', 'el nombre se normaliza sin acentos');
select is((select website_domain from public.institutions where name = 'Colegio Álamo'), 'colegioalamo.edu.mx', 'el dominio se extrae del sitio web');

set local role authenticated;

-- ---------- Vendedor 1 ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select array_agg(name) from public.institutions), array['Colegio Álamo'], 'vendedor ve solo su cartera');
select is((select count(*)::int from public.contacts), 1, 'vendedor ve los contactos de su cartera');
select is((select count(*)::int from public.find_institution_duplicates('colegio alamo')), 1, 'detecta duplicado por nombre');
select is((select reason from public.find_institution_duplicates('Otro nombre', 'colegioalamo.edu.mx')), 'Mismo sitio web', 'detecta duplicado por dominio');
select is((select reason from public.find_institution_duplicates('Otro nombre', null, '(55) 1234-5678')), 'Mismo teléfono', 'detecta duplicado por teléfono');
select is((select name from public.find_institution_duplicates('Universidad del Norte')), 'Universidad Del Norte',
  'avisa de duplicados fuera de su cartera');
select is((select count(*)::int from public.find_institution_duplicates('Instituto Totalmente Distinto')), 0, 'sin falsos positivos con nombres distintos');

-- ---------- Vendedor 2 ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select array_agg(name) from public.institutions), array['Universidad Del Norte'], 'vendedor 2 no ve la cartera del 1');
select is((select count(*)::int from public.contacts), 0, 'vendedor 2 no ve contactos ajenos');
update public.institutions set name = 'Hackeado' where name = 'Colegio Álamo';
select throws_ok(
  $$ insert into public.institutions (organization_id, name, institution_type, country_code, created_by)
     values (public.current_org_id(), 'Ajena', 'school', 'MX', (select id from public.profiles where email = 'rep1@test.dev')) $$,
  '42501', null, 'vendedor 2 no crea instituciones a nombre de otro');

-- ---------- Gerente de CDMX ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is((select array_agg(name) from public.institutions), array['Colegio Álamo'], 'gerente ve la cartera de su oficina (y nadie renombró la ajena)');

-- ---------- Admin A y B ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select count(*)::int from public.institutions), 2, 'admin A ve todas las instituciones de A');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.institutions) + (select count(*)::int from public.find_institution_duplicates('Colegio Alamo')), 0,
  'admin B no ve instituciones ni duplicados de A');

select * from finish();
rollback;
