-- Sincronización nocturna de Gmail: clave de tareas y registro como el dueño de la conexión.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep1@test.dev', r.id from public.organizations o
join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev');
create temp table t (k text, conn uuid, mine uuid, other uuid, inst uuid);
grant all on t to authenticated, anon;

set local role authenticated;
-- El administrador crea una institución y un contacto que el vendedor no ve.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into public.contacts (organization_id, first_name, last_name, email, created_by)
values (public.current_org_id(), 'Oculto', 'X', 'oculto@x.mx', public.current_profile_id());
insert into t (k, other) select public.create_cron_key(), id from public.contacts;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.create_cron_key() $$, 'EB001', null, 'un vendedor no genera la clave');
insert into public.google_connections (organization_id, profile_id, google_email, refresh_token_enc, scopes)
values (public.current_org_id(), public.current_profile_id(), 'rep1@e2.mx', 'cifrado', 'gmail.readonly');
insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
values (public.current_org_id(), 'Colegio Sol', 'school', 'MX', public.current_profile_id(), public.current_profile_id());
insert into public.contacts (organization_id, first_name, last_name, email, created_by)
values (public.current_org_id(), 'Ana', 'Pérez', 'ana@sol.mx', public.current_profile_id());
insert into public.institution_contacts (organization_id, institution_id, contact_id, is_primary)
select public.current_org_id(), i.id, c.id, true from public.institutions i, public.contacts c where c.email = 'ana@sol.mx';
update t set conn = (select id from public.google_connections), mine = (select id from public.contacts where email = 'ana@sol.mx'),
  inst = (select id from public.institutions);

reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select is((select count(*)::int from public.cron_gmail_connections('x' || repeat('0', 40))), 0, 'una clave incorrecta no ve conexiones');
select is((select count(*)::int from public.cron_gmail_connections((select k from t))), 1, 'la clave correcta lista la conexión');
select throws_ok($$ select * from public.cron_gmail_contacts('x' || repeat('0', 40), (select conn from t)) $$, 'EB001', null, 'ni lee contactos sin la clave');
select is((select array_agg(email) from public.cron_gmail_contacts((select k from t), (select conn from t))), array['ana@sol.mx'],
  'solo contactos que el dueño ve');
select is((select institution_id from public.cron_gmail_contacts((select k from t), (select conn from t))), (select inst from t), 'con su institución');

select is(public.cron_gmail_save((select k from t), (select conn from t), jsonb_build_array(
  jsonb_build_object('direction', 'inbound', 'external_id', 'm1', 'subject', 'Hola', 'from_email', 'ana@sol.mx',
    'to_emails', jsonb_build_array('rep1@e2.mx'), 'sent_at', now(), 'contact_id', (select mine from t), 'institution_id', (select inst from t)),
  jsonb_build_object('direction', 'inbound', 'external_id', 'm2', 'from_email', 'oculto@x.mx', 'sent_at', now(), 'contact_id', (select other from t))
), now()), 1, 'registra solo el correo del contacto que ve');
select is(public.cron_gmail_save((select k from t), (select conn from t), jsonb_build_array(
  jsonb_build_object('direction', 'inbound', 'external_id', 'm1', 'from_email', 'ana@sol.mx', 'sent_at', now(), 'contact_id', (select mine from t))
), now()), 0, 'no duplica correos ya registrados');

reset role;
select ok((select last_sync_at is not null and (select owner_id from public.communications) = profile_id from public.google_connections),
  'marca la sincronización y el correo queda a nombre del dueño');

select * from finish();
rollback;
