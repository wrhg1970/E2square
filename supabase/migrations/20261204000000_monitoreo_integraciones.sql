-- Fase 6c: estado de integraciones para administradores. Solo metadatos; nunca tokens ni secretos.
create or replace function public.integration_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.current_org_id();
begin
  if not public.has_permission('admin.structure') then
    raise exception 'No tienes permiso para ver el estado de las integraciones.' using errcode = 'EB001';
  end if;
  return jsonb_build_object(
    'google', coalesce((
      select jsonb_agg(jsonb_build_object('user', coalesce(p.full_name, p.email), 'google_email', g.google_email,
        'connected_at', g.connected_at, 'last_sync_at', g.last_sync_at) order by g.last_sync_at nulls first)
      from public.google_connections g join public.profiles p on p.id = g.profile_id
      where g.organization_id = org), '[]'::jsonb),
    'whatsapp', coalesce((
      select jsonb_agg(jsonb_build_object('display_phone', a.display_phone, 'last_event_at', a.last_event_at) order by a.created_at)
      from public.whatsapp_accounts a where a.organization_id = org), '[]'::jsonb),
    'whatsapp_failed_7d', (select count(*) from public.communications
      where organization_id = org and channel = 'whatsapp' and status = 'failed' and sent_at > now() - interval '7 days'),
    -- Pendiente más de 10 min: el servidor no alcanzó a registrar la respuesta de Meta.
    'whatsapp_stuck', (select count(*) from public.communications
      where organization_id = org and channel = 'whatsapp' and status = 'pending' and sent_at < now() - interval '10 minutes'),
    'last_errors', coalesce((
      select jsonb_agg(jsonb_build_object('sent_at', sent_at, 'to_phone', to_phone, 'error', error) order by sent_at desc)
      from (select sent_at, to_phone, error from public.communications
            where organization_id = org and channel = 'whatsapp' and status = 'failed' order by sent_at desc limit 5) e), '[]'::jsonb)
  );
end $$;
revoke execute on function public.integration_status() from public, anon;
grant execute on function public.integration_status() to authenticated;
