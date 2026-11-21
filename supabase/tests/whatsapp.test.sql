-- Pruebas del webhook de WhatsApp (Fase 6b): firma, idempotencia, asociación y aislamiento.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
select public.bootstrap_organization('Org B', 'org-b', 'admin-b@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep1@test.dev', r.id from public.organizations o join public.roles r on r.organization_id = o.id and r.key = 'sales_rep'
where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'admin-b@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev');

insert into public.institutions (organization_id, name, institution_type, country_code, owner_id, created_by)
select organization_id, 'Colegio Sol', 'school', 'MX', id, id from public.profiles where email = 'rep1@test.dev';
insert into public.contacts (organization_id, first_name, phone, created_by)
select organization_id, 'Ana', '+52 (222) 123-4567', id from public.profiles where email = 'rep1@test.dev';
insert into public.institution_contacts (organization_id, institution_id, contact_id, is_primary)
select i.organization_id, i.id, c.id, true from public.institutions i join public.contacts c on c.organization_id = i.organization_id and c.phone = '+52 (222) 123-4567' where i.name = 'Colegio Sol';

create function pg_temp.body(p_msg_id text, p_from text) returns text language sql as $$
  select jsonb_build_object('object', 'whatsapp_business_account', 'entry', jsonb_build_array(jsonb_build_object('id', '1', 'changes', jsonb_build_array(
    jsonb_build_object('field', 'messages', 'value', jsonb_build_object(
      'metadata', jsonb_build_object('phone_number_id', '1234567890', 'display_phone_number', '5215500000000'),
      'messages', jsonb_build_array(jsonb_build_object('id', p_msg_id, 'from', p_from, 'timestamp', '1795000000', 'type', 'text',
        'text', jsonb_build_object('body', 'Hola, queremos informes del TOEFL')))))))))::text
$$;
create function pg_temp.sign(p_body text, p_secret text) returns text language sql as $$
  select 'sha256=' || encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_secret, 'UTF8'), 'sha256'), 'hex')
$$;
grant execute on function pg_temp.body(text, text), pg_temp.sign(text, text) to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.save_whatsapp_account('1234567890', '+52 55 0000 0000', 'secreto-de-la-app-123', 'token-de-verificacion-1') $$,
  'EB001', null, 'un vendedor no configura WhatsApp');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select lives_ok($$ select public.save_whatsapp_account('1234567890', '+52 55 0000 0000', 'secreto-de-la-app-123', 'token-de-verificacion-1') $$,
  'el administrador registra el número');
select throws_ok($$ select * from public.whatsapp_secrets $$, '42501', null, 'los secretos no se leen por la API');
select is((select count(*)::int from public.audit_log where table_name = 'whatsapp_accounts' and new_data::text like '%secreto%'), 0,
  'la bitácora no guarda el App Secret');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select throws_ok($$ select public.save_whatsapp_account('1234567890', '+1', 'otro-secreto-123456', 'token-de-verificacion-2') $$,
  'EB001', 'Ese número ya está registrado en otra organización.', 'otra organización no se apropia del número');

set local role anon;
select ok(public.whatsapp_verify('token-de-verificacion-1') and not public.whatsapp_verify('token-equivocado-123'), 'verificación del webhook');
select is(public.whatsapp_ingest(pg_temp.body('wamid.1', '5212221234567'), 'sha256=00'), -1, 'firma inválida: no registra nada');
select is(public.whatsapp_ingest(pg_temp.body('wamid.1', '5212221234567'), pg_temp.sign(pg_temp.body('wamid.1', '5212221234567'), 'otro-secreto-123456')), -1,
  'firma con otro secreto: no registra nada');
select is(public.whatsapp_ingest(pg_temp.body('wamid.1', '5212221234567'), pg_temp.sign(pg_temp.body('wamid.1', '5212221234567'), 'secreto-de-la-app-123')), 1,
  'firma válida: registra el mensaje');
select is(public.whatsapp_ingest(pg_temp.body('wamid.1', '5212221234567'), pg_temp.sign(pg_temp.body('wamid.1', '5212221234567'), 'secreto-de-la-app-123')), 0,
  'el reintento de Meta no duplica');
select is(public.whatsapp_ingest(pg_temp.body('wamid.2', '5215599999999'), pg_temp.sign(pg_temp.body('wamid.2', '5215599999999'), 'secreto-de-la-app-123')), 1,
  'número desconocido también se registra');

reset role;
select is((select string_agg(concat_ws('|', from_phone, (contact_id is not null)::text, (institution_id is not null)::text,
    (select email from public.profiles p where p.id = owner_id)), ', ' order by external_id) from public.communications where channel = 'whatsapp'),
  '+5212221234567|true|true|rep1@test.dev, +5215599999999|false|false|admin-a@test.dev',
  'asocia por los últimos 10 dígitos al contacto y su institución; el dueño es el responsable de la institución o quien configuró el número');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.communications) + (select count(*)::int from public.whatsapp_accounts), 0,
  'otra organización no ve ni el número ni los mensajes');

select * from finish();
rollback;
