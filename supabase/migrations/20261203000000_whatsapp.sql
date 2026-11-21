-- Fase 6b: WhatsApp Cloud API (oficial de Meta), solo recepción por ahora.
-- El webhook no tiene sesión de usuario y la app no usa la llave service_role: la firma de Meta
-- (X-Hub-Signature-256, HMAC-SHA256 del cuerpo con el App Secret) se verifica aquí, dentro de la base.

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  display_phone text not null,
  created_by uuid not null,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
create trigger whatsapp_accounts_set_updated_at before update on public.whatsapp_accounts
for each row execute function public.set_updated_at();
create trigger whatsapp_accounts_audit after insert or update or delete on public.whatsapp_accounts
for each row execute function public.audit_row();

alter table public.whatsapp_accounts enable row level security;
create policy whatsapp_accounts_select on public.whatsapp_accounts for select to authenticated
  using (organization_id = public.current_org_id());
create policy whatsapp_accounts_delete on public.whatsapp_accounts for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'));

-- Secretos aparte y sin auditoría (la bitácora guardaría el valor). Nadie los lee por la API: RLS sin políticas.
create table public.whatsapp_secrets (
  account_id uuid primary key references public.whatsapp_accounts(id) on delete cascade,
  app_secret text not null check (length(app_secret) >= 16),
  verify_token text not null check (length(verify_token) >= 16)
);
alter table public.whatsapp_secrets enable row level security;
revoke all on public.whatsapp_secrets from anon, authenticated;

-- Mensajes de WhatsApp en el mismo registro de comunicaciones que Gmail.
alter table public.communications drop constraint communications_channel_check;
alter table public.communications add constraint communications_channel_check check (channel in ('email', 'whatsapp'));
alter table public.communications alter column from_email drop not null;
alter table public.communications add column from_phone text;
alter table public.communications add constraint communications_from_check
  check ((channel = 'email' and from_email is not null) or (channel = 'whatsapp' and from_phone is not null));
-- Meta reintenta el webhook: el id del mensaje hace la inserción idempotente.
create unique index communications_whatsapp_once on public.communications (organization_id, external_id) where channel = 'whatsapp';

-- Alta o cambio del número (solo administradores). Devuelve el id de la cuenta.
create or replace function public.save_whatsapp_account(p_phone_number_id text, p_display_phone text, p_app_secret text, p_verify_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare acc uuid;
begin
  if not public.has_permission('admin.structure') then
    raise exception 'No tienes permiso para configurar WhatsApp.' using errcode = 'EB001';
  end if;
  if coalesce(trim(p_phone_number_id), '') !~ '^[0-9]{5,30}$' then
    raise exception 'El Phone number ID son solo dígitos (lo ves en Meta › WhatsApp › API Setup).' using errcode = 'EB001';
  end if;
  if length(coalesce(p_app_secret, '')) < 16 then
    raise exception 'El App Secret parece incompleto.' using errcode = 'EB001';
  end if;
  select id into acc from public.whatsapp_accounts where phone_number_id = trim(p_phone_number_id);
  if acc is not null and not exists (select 1 from public.whatsapp_accounts where id = acc and organization_id = public.current_org_id()) then
    raise exception 'Ese número ya está registrado en otra organización.' using errcode = 'EB001';
  end if;
  if acc is null then
    insert into public.whatsapp_accounts (organization_id, phone_number_id, display_phone, created_by)
    values (public.current_org_id(), trim(p_phone_number_id), trim(p_display_phone), public.current_profile_id()) returning id into acc;
  else
    update public.whatsapp_accounts set display_phone = trim(p_display_phone) where id = acc;
  end if;
  insert into public.whatsapp_secrets (account_id, app_secret, verify_token) values (acc, p_app_secret, p_verify_token)
  on conflict (account_id) do update set app_secret = excluded.app_secret, verify_token = excluded.verify_token;
  return acc;
end $$;
revoke execute on function public.save_whatsapp_account(text, text, text, text) from public, anon;
grant execute on function public.save_whatsapp_account(text, text, text, text) to authenticated;

-- Paso de verificación del webhook (GET de Meta con hub.verify_token).
create or replace function public.whatsapp_verify(p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
  select length(coalesce(p_token, '')) >= 16 and exists (select 1 from public.whatsapp_secrets where verify_token = p_token)
$$;
revoke execute on function public.whatsapp_verify(text) from public;
grant execute on function public.whatsapp_verify(text) to anon, authenticated;

-- Recibe el cuerpo crudo del webhook y su firma. Solo registra cambios de números cuya firma es válida.
-- Devuelve cuántos mensajes nuevos registró, o -1 si ninguna firma coincide.
create or replace function public.whatsapp_ingest(p_body text, p_signature text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
  ch jsonb;
  msg jsonb;
  acc record;
  verified boolean := false;
  inserted integer := 0;
  n integer;
  digits text;
  c record;
  body_text text;
begin
  begin
    payload := p_body::jsonb;
  exception when others then
    return -1;
  end;
  for ch in select jsonb_array_elements(e->'changes') from jsonb_array_elements(coalesce(payload->'entry', '[]')) e loop
    select a.*, s.app_secret into acc from public.whatsapp_accounts a join public.whatsapp_secrets s on s.account_id = a.id
    where a.phone_number_id = ch->'value'->'metadata'->>'phone_number_id';
    continue when acc is null
      or coalesce(p_signature, '') <> 'sha256=' || encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(acc.app_secret, 'UTF8'), 'sha256'), 'hex');
    verified := true;
    update public.whatsapp_accounts set last_event_at = now() where id = acc.id;

    for msg in select jsonb_array_elements(coalesce(ch->'value'->'messages', '[]')) loop
      digits := regexp_replace(coalesce(msg->>'from', ''), '\D', '', 'g');
      continue when digits = '' or coalesce(msg->>'id', '') = '';
      -- Mismo número si coinciden los últimos 10 dígitos (México y la mayoría de Latinoamérica).
      select ct.id, ic.institution_id, i.owner_id into c
      from public.contacts ct
      left join public.institution_contacts ic on ic.contact_id = ct.id
      left join public.institutions i on i.id = ic.institution_id
      where ct.organization_id = acc.organization_id and ct.phone is not null
        and right(regexp_replace(ct.phone, '\D', '', 'g'), 10) = right(digits, 10)
        and length(regexp_replace(ct.phone, '\D', '', 'g')) >= 10
      order by ic.is_primary desc nulls last, ct.created_at
      limit 1;
      body_text := case msg->>'type'
        when 'text' then msg->'text'->>'body'
        when 'button' then msg->'button'->>'text'
        when 'interactive' then coalesce(msg->'interactive'->'button_reply'->>'title', msg->'interactive'->'list_reply'->>'title')
        else '[' || coalesce(msg->>'type', 'mensaje') || ']'
      end;
      insert into public.communications (organization_id, owner_id, channel, direction, external_id, snippet, from_phone, to_emails, sent_at, contact_id, institution_id)
      values (acc.organization_id, coalesce(c.owner_id, acc.created_by), 'whatsapp', 'inbound', msg->>'id', left(body_text, 500), '+' || digits, '{}',
              case when msg->>'timestamp' ~ '^[0-9]{1,12}$' then to_timestamp((msg->>'timestamp')::bigint) else now() end, c.id, c.institution_id)
      on conflict (organization_id, external_id) where channel = 'whatsapp' do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
    end loop;
  end loop;
  return case when verified then inserted else -1 end;
end $$;
revoke execute on function public.whatsapp_ingest(text, text) from public;
grant execute on function public.whatsapp_ingest(text, text) to anon, authenticated;
