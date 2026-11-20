-- Pruebas del puntaje explicable de instituciones (Fase 8b).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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

insert into public.institutions (organization_id, name, institution_type, country_code, potential, owner_id, created_by)
select organization_id, x.name, 'school', 'MX', x.potential, id, id
from public.profiles, (values ('Colegio Alto', 'high'), ('Colegio Bajo', 'low')) x(name, potential)
where email = 'rep1@test.dev';
insert into public.contacts (organization_id, first_name, last_name, email, created_by)
select organization_id, 'Ana', 'Pérez', 'ana@alto.mx', id from public.profiles where email = 'rep1@test.dev';
insert into public.institution_contacts (organization_id, institution_id, contact_id, decision_role, is_primary)
select i.organization_id, i.id, c.id, 'decision_maker', true from public.institutions i, public.contacts c
where i.name = 'Colegio Alto' and c.email = 'ana@alto.mx';
create temp table ids as select array_agg(id) as all_ids,
  (select id from public.institutions where name = 'Colegio Alto') as alto,
  (select id from public.institutions where name = 'Colegio Bajo') as bajo
from public.institutions;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select is((select jsonb_array_length(factors) from public.institution_scores((select all_ids from ids)) limit 1), 7,
  'cada puntaje explica sus siete factores');
select is((select score from public.institution_scores((select all_ids from ids)) where institution_id = (select bajo from ids)), 4,
  'potencial bajo sin más señales = 4 puntos (0.2 × 20 / 100)');
select is((select score from public.institution_scores((select all_ids from ids)) where institution_id = (select alto from ids)), 35,
  'potencial alto + decisor = 35 puntos');
select ok((select computed_at is not null from public.institution_scores((select all_ids from ids)) limit 1),
  'muestra la fecha de cálculo');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.institution_scores((select all_ids from ids))), 0,
  'otro vendedor no obtiene puntajes de instituciones que no ve');

reset role;
update public.organizations set score_weights = score_weights || '{"fit": 0}';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select score from public.institution_scores((select all_ids from ids)) where institution_id = (select bajo from ids)), 0,
  'los pesos de la organización cambian el puntaje');

select * from finish();
rollback;
