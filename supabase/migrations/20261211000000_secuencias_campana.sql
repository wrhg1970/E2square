-- Secuencias de campaña: varios pasos (día, tipo y asunto) que al lanzar se vuelven tareas internas
-- para el responsable de cada institución. No envía nada por sí sola. Reglas propuestas:
--   * Los pasos se editan solo mientras la campaña está en borrador; máximo 10.
--   * Sin pasos, el lanzamiento crea un solo seguimiento como antes.
--   * Si la institución abre una oportunidad marcada con la campaña, sus tareas futuras de la secuencia se cancelan.
create table public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null,
  day_offset int not null check (day_offset between 0 and 365),
  activity_type text not null check (activity_type in (
    'call', 'email', 'whatsapp', 'visit', 'meeting', 'video_call', 'presentation', 'proposal', 'follow_up', 'internal_task')),
  subject text not null check (length(trim(subject)) between 2 and 150),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id) on delete cascade
);
create index campaign_steps_campaign_idx on public.campaign_steps (campaign_id, day_offset);
create trigger campaign_steps_audit after insert or update or delete on public.campaign_steps
for each row execute function public.audit_row();

alter table public.campaign_steps enable row level security;
create policy campaign_steps_select on public.campaign_steps for select to authenticated
  using (organization_id = public.current_org_id());
create policy campaign_steps_insert on public.campaign_steps for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('campaigns.manage')
              and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'draft')
              and (select count(*) from public.campaign_steps s where s.campaign_id = campaign_steps.campaign_id) < 10);
create policy campaign_steps_delete on public.campaign_steps for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('campaigns.manage')
         and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'draft'));

alter table public.activities add column campaign_id uuid,
  add foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id);
create index activities_campaign_idx on public.activities (campaign_id) where campaign_id is not null;

create or replace function public.launch_campaign(p_campaign uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare camp record; n integer;
begin
  if not public.has_permission('campaigns.manage') then
    raise exception 'No tienes permiso para lanzar campañas.' using errcode = 'EB001';
  end if;
  select * into camp from public.campaigns where id = p_campaign and organization_id = public.current_org_id();
  if camp.id is null then raise exception 'Campaña no encontrada.' using errcode = 'EB001'; end if;
  if camp.status <> 'draft' then raise exception 'Solo se lanza una campaña en borrador.' using errcode = 'EB001'; end if;
  if not exists (select 1 from public.campaign_members where campaign_id = camp.id) then
    raise exception 'Agrega audiencia antes de lanzar.' using errcode = 'EB001';
  end if;

  -- Sin pasos definidos, un solo seguimiento el día de inicio (comportamiento original).
  insert into public.activities (organization_id, activity_type, subject, institution_id, contact_id, owner_id, due_at, priority,
                                 created_by, notes, campaign_id)
  select m.organization_id, s.activity_type,
         left('Campaña: ' || camp.name || coalesce(' · ' || s.subject, ''), 200), m.institution_id, m.contact_id,
         coalesce(i.owner_id, camp.owner_id),
         greatest(now(), (camp.start_date + s.day_offset + time '09:00') at time zone 'America/Mexico_City'), 'normal',
         public.current_profile_id(),
         case when m.consent_basis = 'granted' then 'Contacto con consentimiento registrado.'
              else 'Sin consentimiento registrado: no envíes mensajes masivos; contacto uno a uno.' end,
         camp.id
  from public.campaign_members m
  join public.institutions i on i.id = m.institution_id
  cross join lateral (
    select st.day_offset, st.activity_type, st.subject from public.campaign_steps st where st.campaign_id = camp.id
    union all
    select 0, 'follow_up', null where not exists (select 1 from public.campaign_steps st where st.campaign_id = camp.id)
  ) s
  where m.campaign_id = camp.id;
  get diagnostics n = row_count;

  update public.campaigns set status = 'active', launched_at = now() where id = camp.id;
  return n;
end $$;

-- La institución ya respondió con una oportunidad: no seguir con los pasos que faltan.
create or replace function public.stop_campaign_sequence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.activities set status = 'cancelled'
  where campaign_id = new.source_campaign_id and institution_id = new.institution_id and status = 'pending' and due_at > now();
  return new;
end $$;
revoke execute on function public.stop_campaign_sequence() from public, anon, authenticated;
create trigger opportunities_stop_campaign_sequence after insert on public.opportunities
for each row when (new.source_campaign_id is not null) execute function public.stop_campaign_sequence();

-- Tareas pendientes: las de la secuencia (campaign_id) y, para campañas lanzadas antes, por asunto.
create or replace function public.campaign_results(p_campaign uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with camp as (select * from public.campaigns where id = p_campaign),
  m as (select cm.* from public.campaign_members cm, camp where cm.campaign_id = camp.id),
  since as (select coalesce(launched_at, start_date::timestamptz) as t from camp),
  o as (
    select op.status, op.closed_at,
      public.convert_amount(op.amount, op.currency_code, camp.currency_code, coalesce(public.local_date(op.closed_at), current_date)) as amount_c,
      public.convert_amount(op.margin, op.currency_code, camp.currency_code, coalesce(public.local_date(op.closed_at), current_date)) as margin_c
    from public.opportunities op, camp where op.source_campaign_id = camp.id
  ),
  won as (select coalesce(sum(margin_c), 0) as margin, coalesce(sum(amount_c), 0) as amount, count(*) as n from o where status = 'won')
  select jsonb_build_object(
    'members', (select count(*) from m),
    'with_consent', (select count(*) from m where consent_basis = 'granted'),
    'responded', (select count(distinct c.institution_id) from public.communications c, since
                  where c.institution_id in (select institution_id from m) and c.direction = 'inbound' and c.sent_at >= since.t),
    'meetings', (select count(*) from public.activities a, since
                 where a.institution_id in (select institution_id from m) and a.status = 'done'
                   and a.activity_type in ('meeting', 'visit', 'video_call', 'presentation') and a.completed_at >= since.t),
    'tasks_pending', (select count(*) from public.activities a, camp
                      where a.status = 'pending' and (a.campaign_id = camp.id or (a.campaign_id is null and a.institution_id in (select institution_id from m) and a.subject = left('Campaña: ' || camp.name, 200)))),
    'opportunities', (select count(*) from o),
    'open_amount', coalesce((select sum(amount_c) from o where status = 'open'), 0),
    'won_count', (select n from won),
    'won_amount', (select amount from won),
    'won_margin', (select margin from won),
    'unconverted', (select count(*) from o where amount_c is null),
    'cost', (select actual_cost from camp),
    'roi_pct', (select case when camp.actual_cost > 0 then round(((won.margin - camp.actual_cost) / camp.actual_cost) * 100, 1) end from camp, won)
  )
$$;
