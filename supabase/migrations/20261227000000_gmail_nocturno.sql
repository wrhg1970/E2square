-- Sincronización nocturna de Gmail (regla 14, confirmada por Will el 2026-11-25).
-- La tarea programada de Vercel no usa la llave maestra de Supabase: llama estas funciones con la llave
-- pública y una clave de tareas que el administrador genera en Integraciones. Aquí solo se guarda su hash.
-- Cada usuario se procesa "como él mismo" (sus permisos de visibilidad), igual que el botón manual.

create table public.cron_keys (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  key_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.cron_keys enable row level security;
revoke all on public.cron_keys from anon, authenticated;

-- Genera (o reemplaza) la clave; se muestra una sola vez.
create or replace function public.create_cron_key()
returns text language plpgsql security definer set search_path = '' as $$
declare k text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.has_permission('admin.structure') then
    raise exception 'No tienes permiso para generar la clave de tareas.' using errcode = 'EB001';
  end if;
  insert into public.cron_keys (organization_id, key_hash, created_by)
  values (public.current_org_id(), encode(sha256(convert_to(k, 'UTF8')), 'hex'), public.current_profile_id())
  on conflict (organization_id) do update set key_hash = excluded.key_hash, created_by = excluded.created_by, created_at = now();
  return k;
end $$;
revoke execute on function public.create_cron_key() from public, anon;
grant execute on function public.create_cron_key() to authenticated;

create or replace function public.cron_key_created_at()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select created_at from public.cron_keys where organization_id = public.current_org_id() and public.has_permission('admin.structure')
$$;
revoke execute on function public.cron_key_created_at() from public, anon;
grant execute on function public.cron_key_created_at() to authenticated;

-- Conexiones de usuarios activos de las organizaciones cuya clave coincide.
create or replace function public.cron_gmail_connections(p_key text)
returns table (id uuid, google_email text, refresh_token_enc text, last_sync_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.google_email, g.refresh_token_enc, g.last_sync_at
  from public.google_connections g
  join public.cron_keys k on k.organization_id = g.organization_id
  join public.profiles p on p.id = g.profile_id and p.status = 'active' and p.auth_user_id is not null
  where length(coalesce(p_key, '')) >= 32 and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
$$;

-- Valida la clave y actúa como el dueño de la conexión durante esta transacción.
create or replace function public.cron_act_as(p_key text, p_connection uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select p.auth_user_id into uid
  from public.google_connections g
  join public.cron_keys k on k.organization_id = g.organization_id
  join public.profiles p on p.id = g.profile_id and p.status = 'active'
  where g.id = p_connection and length(coalesce(p_key, '')) >= 32
    and k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if uid is null then
    raise exception 'Clave de tareas no válida.' using errcode = 'EB001';
  end if;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  return uid;
end $$;
revoke execute on function public.cron_act_as(text, uuid) from public, anon, authenticated;

-- Contactos con correo que el dueño ve, con su institución (la principal primero) si también la ve.
create or replace function public.cron_gmail_contacts(p_key text, p_connection uuid)
returns table (email text, contact_id uuid, institution_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cron_act_as(p_key, p_connection);
  return query
    select lower(c.email), c.id,
      (select ic.institution_id from public.institution_contacts ic
       where ic.contact_id = c.id and public.can_see_institution_id(ic.institution_id)
       order by ic.is_primary desc limit 1)
    from public.contacts c
    where c.email is not null and public.can_see_contact(c);
end $$;

-- Registra los correos (mismas reglas que la política de inserción) y marca la sincronización.
create or replace function public.cron_gmail_save(p_key text, p_connection uuid, p_rows jsonb, p_started_at timestamptz)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.cron_act_as(p_key, p_connection);
  insert into public.communications (organization_id, owner_id, direction, external_id, thread_id, subject, snippet,
                                     from_email, to_emails, sent_at, contact_id, institution_id)
  select public.current_org_id(), public.current_profile_id(), r.direction, r.external_id, r.thread_id,
         left(r.subject, 500), left(r.snippet, 500), r.from_email, coalesce(r.to_emails, '{}'), r.sent_at, r.contact_id, r.institution_id
  from jsonb_to_recordset(coalesce(p_rows, '[]')) as r(direction text, external_id text, thread_id text, subject text, snippet text,
       from_email text, to_emails text[], sent_at timestamptz, contact_id uuid, institution_id uuid)
  join public.contacts c on c.id = r.contact_id and public.can_see_contact(c)
  where r.institution_id is null or public.can_see_institution_id(r.institution_id)
  on conflict (owner_id, external_id, contact_id) do nothing;
  get diagnostics n = row_count;
  update public.google_connections set last_sync_at = p_started_at where id = p_connection;
  return n;
end $$;

revoke execute on function public.cron_gmail_connections(text) from public;
revoke execute on function public.cron_gmail_contacts(text, uuid) from public;
revoke execute on function public.cron_gmail_save(text, uuid, jsonb, timestamptz) from public;
grant execute on function public.cron_gmail_connections(text) to anon, authenticated;
grant execute on function public.cron_gmail_contacts(text, uuid) to anon, authenticated;
grant execute on function public.cron_gmail_save(text, uuid, jsonb, timestamptz) to anon, authenticated;
