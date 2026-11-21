-- Fase 6b: WhatsApp Cloud API (oficial de Meta): recepción, estados y envío con reglas de consentimiento.
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
alter table public.communications add column from_phone text, add column to_phone text,
  add column status text check (status in ('received', 'pending', 'sent', 'delivered', 'read', 'failed')),
  add column error text;
alter table public.communications add constraint communications_from_check
  check ((channel = 'email' and from_email is not null) or (channel = 'whatsapp' and from_phone is not null));
-- Meta reintenta el webhook: el id del mensaje hace la inserción idempotente.
create unique index communications_whatsapp_once on public.communications (organization_id, external_id) where channel = 'whatsapp';

-- Consentimiento (opt-in) por contacto: quién lo registró se ve en la bitácora de contactos.
alter table public.contacts add column consent_updated_at timestamptz, add column consent_source text check (length(consent_source) <= 200);

-- Plantillas aprobadas en Meta. El nombre e idioma deben coincidir con los de WhatsApp Manager.
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (name ~ '^[a-z0-9_]+$' and length(name) <= 512),
  language text not null default 'es_MX' check (language ~ '^[a-z]{2}(_[A-Z]{2})?$'),
  body_preview text not null check (length(body_preview) between 1 and 1024),
  uses_first_name boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name, language)
);
create trigger whatsapp_templates_set_updated_at before update on public.whatsapp_templates
for each row execute function public.set_updated_at();
create trigger whatsapp_templates_audit after insert or update or delete on public.whatsapp_templates
for each row execute function public.audit_row();
alter table public.whatsapp_templates enable row level security;
create policy whatsapp_templates_select on public.whatsapp_templates for select to authenticated
  using (organization_id = public.current_org_id());
create policy whatsapp_templates_write on public.whatsapp_templates for all to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'))
  with check (organization_id = public.current_org_id() and public.has_permission('admin.structure'));

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
  st jsonb;
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

    -- Estados de lo que enviamos: nunca retroceden (read no vuelve a delivered).
    for st in select jsonb_array_elements(coalesce(ch->'value'->'statuses', '[]')) loop
      update public.communications set
        status = st->>'status',
        error = case when st->>'status' = 'failed' then left(coalesce(st->'errors'->0->>'title', st->'errors'->0->>'message', 'Falló el envío'), 300) end
      where organization_id = acc.organization_id and channel = 'whatsapp' and direction = 'outbound' and external_id = st->>'id'
        and st->>'status' in ('sent', 'delivered', 'read', 'failed')
        and array_position(array['pending', 'sent', 'delivered', 'read', 'failed'], st->>'status')
          > coalesce(array_position(array['pending', 'sent', 'delivered', 'read', 'failed'], status), 0);
    end loop;

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
      insert into public.communications (organization_id, owner_id, channel, direction, external_id, snippet, from_phone, to_emails, sent_at, contact_id, institution_id, status)
      values (acc.organization_id, coalesce(c.owner_id, acc.created_by), 'whatsapp', 'inbound', msg->>'id', left(body_text, 500), '+' || digits, '{}',
              case when msg->>'timestamp' ~ '^[0-9]{1,12}$' then to_timestamp((msg->>'timestamp')::bigint) else now() end, c.id, c.institution_id, 'received')
      on conflict (organization_id, external_id) where channel = 'whatsapp' do nothing;
      get diagnostics n = row_count;
      inserted := inserted + n;
      -- Baja por palabra clave: el contacto deja de recibir mensajes iniciados por la empresa.
      if n > 0 and c.id is not null and upper(trim(both ' .!' from coalesce(body_text, ''))) in ('BAJA', 'STOP', 'ALTO', 'CANCELAR', 'NO MOLESTAR') then
        update public.contacts set consent_status = 'revoked', consent_updated_at = now(), consent_source = 'Pidió la baja por WhatsApp'
        where id = c.id;
      end if;
    end loop;
  end loop;
  return case when verified then inserted else -1 end;
end $$;
revoke execute on function public.whatsapp_ingest(text, text) from public;
grant execute on function public.whatsapp_ingest(text, text) to anon, authenticated;

-- Prepara un envío aplicando las reglas (Will 2026-11-21, propuestas por el CRM):
--   1) quien envía debe ver la institución; 2) un contacto que pidió la baja no recibe nada;
--   3) mensaje libre solo dentro de 24 h desde el último mensaje del contacto (ventana de servicio de Meta);
--   4) fuera de esa ventana, solo plantillas aprobadas y solo con consentimiento registrado.
-- Deja el mensaje "pending"; el servidor lo envía a Meta y llama a whatsapp_mark_sent.
create or replace function public.whatsapp_prepare_send(p_institution uuid, p_contact uuid, p_template uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ct record;
  acc record;
  tpl record;
  to_digits text;
  window_open boolean;
  comm uuid;
begin
  if not public.can_see_institution_id(p_institution) then
    raise exception 'No tienes acceso a esta institución.' using errcode = 'EB001';
  end if;
  select c.*, i.country_code into ct from public.contacts c
  join public.institution_contacts ic on ic.contact_id = c.id and ic.institution_id = p_institution
  join public.institutions i on i.id = p_institution
  where c.id = p_contact;
  if ct.id is null then raise exception 'El contacto no pertenece a esta institución.' using errcode = 'EB001'; end if;
  if ct.consent_status = 'revoked' then
    raise exception 'Este contacto pidió no recibir mensajes.' using errcode = 'EB001';
  end if;
  to_digits := regexp_replace(coalesce(ct.phone, ''), '\D', '', 'g');
  if length(to_digits) = 10 and ct.country_code = 'MX' then to_digits := '52' || to_digits; end if;
  if length(to_digits) < 11 then
    raise exception 'El teléfono del contacto necesita lada internacional, p. ej. +52 55 1234 5678.' using errcode = 'EB001';
  end if;
  select a.* into acc from public.whatsapp_accounts a where a.organization_id = public.current_org_id() order by a.created_at limit 1;
  if acc.id is null then raise exception 'Todavía no hay un número de WhatsApp conectado.' using errcode = 'EB001'; end if;

  window_open := exists (
    select 1 from public.communications m
    where m.organization_id = acc.organization_id and m.channel = 'whatsapp' and m.direction = 'inbound'
      and right(regexp_replace(m.from_phone, '\D', '', 'g'), 10) = right(to_digits, 10)
      and m.sent_at > now() - interval '24 hours');

  -- Siempre se consulta para que tpl quede asignado (con nulos si no hay plantilla).
  select t.* into tpl from public.whatsapp_templates t where t.id = p_template and t.organization_id = acc.organization_id and t.active;
  if p_template is not null then
    if tpl.id is null then raise exception 'Esa plantilla no existe o está desactivada.' using errcode = 'EB001'; end if;
    if ct.consent_status <> 'granted' and not window_open then
      raise exception 'Registra primero que el contacto aceptó recibir WhatsApp.' using errcode = 'EB001';
    end if;
  else
    if length(trim(coalesce(p_text, ''))) = 0 or length(p_text) > 4096 then
      raise exception 'Escribe el mensaje (máximo 4096 caracteres).' using errcode = 'EB001';
    end if;
    if not window_open then
      raise exception 'Pasaron más de 24 h desde el último mensaje del contacto: solo puedes enviar una plantilla aprobada.' using errcode = 'EB001';
    end if;
  end if;

  insert into public.communications (organization_id, owner_id, channel, direction, external_id, snippet, from_phone, to_phone, to_emails, sent_at, contact_id, institution_id, status)
  values (acc.organization_id, public.current_profile_id(), 'whatsapp', 'outbound', 'pendiente:' || gen_random_uuid(),
          left(coalesce(case when tpl.id is not null then replace(tpl.body_preview, '{{1}}', ct.first_name) end, p_text), 500),
          acc.display_phone, '+' || to_digits, '{}', now(), ct.id, p_institution, 'pending')
  returning id into comm;

  return jsonb_build_object('id', comm, 'phone_number_id', acc.phone_number_id, 'to', to_digits,
    'template', case when tpl.id is not null then jsonb_build_object('name', tpl.name, 'language', tpl.language, 'first_name', case when tpl.uses_first_name then ct.first_name end) end,
    'text', case when tpl.id is null then p_text end);
end $$;
revoke execute on function public.whatsapp_prepare_send(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.whatsapp_prepare_send(uuid, uuid, uuid, text) to authenticated;

-- Resultado del envío a Meta: solo quien lo preparó, y solo mientras está pendiente.
create or replace function public.whatsapp_mark_sent(p_id uuid, p_wamid text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.communications set
    external_id = case when p_error is null and coalesce(p_wamid, '') <> '' then left(p_wamid, 200) else external_id end,
    status = case when p_error is null and coalesce(p_wamid, '') <> '' then 'sent' else 'failed' end,
    error = left(p_error, 300)
  where id = p_id and owner_id = public.current_profile_id() and status = 'pending' and channel = 'whatsapp';
end $$;
revoke execute on function public.whatsapp_mark_sent(uuid, text, text) from public, anon;
grant execute on function public.whatsapp_mark_sent(uuid, text, text) to authenticated;
