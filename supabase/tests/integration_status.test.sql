-- Estado de integraciones (Fase 6c): solo administradores y sin secretos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select public.bootstrap_organization('Org A', 'org-a', 'admin-a@test.dev');
insert into public.invitations (organization_id, email, role_id)
select o.id, 'rep1@test.dev', r.id from public.organizations o join public.roles r on r.organization_id = o.id and r.key = 'sales_rep' where o.slug = 'org-a';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin-a@test.dev'),
  ('00000000-0000-0000-0000-000000000001', 'rep1@test.dev');
insert into public.google_connections (organization_id, profile_id, google_email, refresh_token_enc, scopes, last_sync_at)
select organization_id, id, 'rep1@colegio.mx', 'TOKEN-CIFRADO-SECRETO', 'gmail', now() - interval '9 days' from public.profiles where email = 'rep1@test.dev';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.integration_status() $$, 'EB001', null, 'un vendedor no ve el estado de integraciones');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select lives_ok($$ select public.save_whatsapp_account('1234567890', '+52 55 0000 0000', 'secreto-de-la-app-123', 'token-de-verificacion-1') $$, 'número conectado');
select is((select public.integration_status()->'google'->0->>'google_email'), 'rep1@colegio.mx', 'el admin ve la cuenta de Google y su última sincronización');
select ok((select public.integration_status()::text not like '%SECRETO%' and public.integration_status()::text not like '%secreto-de-la-app%'),
  'nunca devuelve tokens ni el App Secret');

select * from finish();
rollback;
