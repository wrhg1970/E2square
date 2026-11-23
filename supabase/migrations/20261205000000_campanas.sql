-- Fase 6d: campañas (segmento → audiencia → lanzamiento con tareas → resultados y ROI).
-- Reglas propuestas por el CRM (pendientes de confirmar por Will):
--   * La audiencia sale de un segmento (país, tipo, responsable, estatus) y solo de instituciones que quien la arma puede ver.
--   * Se excluyen instituciones inactivas y las que solo tienen contactos que pidieron "no contactar".
--   * Al lanzar, cada institución recibe una tarea de seguimiento asignada a su responsable.
--   * Atribución: una oportunidad cuenta para la campaña si se creó marcada con ella (source_campaign_id).
--   * ROI = (margen ganado − costo real) / costo real, en la moneda de la campaña.

insert into public.permissions (key, description) values
  ('campaigns.manage', 'Crear, segmentar y lanzar campañas')
on conflict (key) do nothing;

create or replace function public.grant_campaign_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (organization_id, role_id, permission_key)
  select new.organization_id, new.id, 'campaigns.manage'
  where new.key in ('admin', 'general_director', 'sales_director', 'marketing')
  on conflict (role_id, permission_key) do nothing;
  return new;
end $$;
revoke execute on function public.grant_campaign_permissions() from public, anon, authenticated;
create trigger roles_grant_campaigns after insert on public.roles
for each row execute function public.grant_campaign_permissions();

insert into public.role_permissions (organization_id, role_id, permission_key)
select r.organization_id, r.id, 'campaigns.manage' from public.roles r
where r.key in ('admin', 'general_director', 'sales_director', 'marketing')
on conflict (role_id, permission_key) do nothing;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 2 and 200),
  campaign_type text not null check (campaign_type in ('email', 'whatsapp', 'call', 'event', 'fair', 'visit', 'other')),
  product_id uuid,
  start_date date not null,
  end_date date,
  currency_code char(3) not null default 'MXN' check (currency_code ~ '^[A-Z]{3}$'),
  budget_amount numeric(18,4) not null default 0 check (budget_amount >= 0),
  actual_cost numeric(18,4) not null default 0 check (actual_cost >= 0),
  owner_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'finished', 'cancelled')),
  segment jsonb not null default '{}',
  notes text check (notes is null or length(notes) <= 5000),
  launched_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (id, organization_id),
  foreign key (product_id, organization_id) references public.products(id, organization_id),
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
create trigger campaigns_audit after insert or update or delete on public.campaigns for each row execute function public.audit_row();

create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null,
  institution_id uuid not null,
  contact_id uuid,
  consent_basis text not null default 'unknown' check (consent_basis in ('granted', 'unknown')),
  created_at timestamptz not null default now(),
  unique (campaign_id, institution_id),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id) on delete cascade,
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts(id, organization_id) on delete set null (contact_id)
);
create index campaign_members_institution on public.campaign_members (institution_id);

alter table public.opportunities add column source_campaign_id uuid;
alter table public.opportunities add constraint opportunities_source_campaign_fk
  foreign key (source_campaign_id, organization_id) references public.campaigns(id, organization_id);
create index opportunities_source_campaign on public.opportunities (source_campaign_id) where source_campaign_id is not null;

alter table public.campaigns enable row level security;
create policy campaigns_select on public.campaigns for select to authenticated
  using (organization_id = public.current_org_id());
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('campaigns.manage') and status = 'draft');
create policy campaigns_update on public.campaigns for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('campaigns.manage'))
  with check (organization_id = public.current_org_id());
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('campaigns.manage') and status = 'draft');

alter table public.campaign_members enable row level security;
create policy campaign_members_select on public.campaign_members for select to authenticated
  using (organization_id = public.current_org_id() and public.can_see_institution_id(institution_id));
create policy campaign_members_delete on public.campaign_members for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('campaigns.manage')
         and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'draft'));

-- El lanzamiento y la audiencia pasan por funciones; el estado no se cambia a mano de borrador a activa.
create or replace function public.campaigns_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'draft' and new.status = 'active' and new.launched_at is null then
    raise exception 'Usa "Lanzar campaña" para activarla.' using errcode = 'EB001';
  end if;
  if old.status in ('finished', 'cancelled') and new.status <> old.status then
    raise exception 'Una campaña terminada o cancelada no se reabre.' using errcode = 'EB001';
  end if;
  return new;
end $$;
create trigger campaigns_guard before update on public.campaigns for each row execute function public.campaigns_guard();

-- Agrega a la audiencia las instituciones visibles que cumplen el segmento. Devuelve cuántas entraron.
create or replace function public.add_campaign_members(p_campaign uuid, p_country text, p_types text[], p_owner uuid, p_status text)
returns integer language plpgsql security definer set search_path = '' as $$
declare camp record; n integer;
begin
  if not public.has_permission('campaigns.manage') then
    raise exception 'No tienes permiso para armar campañas.' using errcode = 'EB001';
  end if;
  select * into camp from public.campaigns where id = p_campaign and organization_id = public.current_org_id();
  if camp.id is null then raise exception 'Campaña no encontrada.' using errcode = 'EB001'; end if;
  if camp.status not in ('draft', 'active') then
    raise exception 'La campaña ya terminó.' using errcode = 'EB001';
  end if;

  insert into public.campaign_members (organization_id, campaign_id, institution_id, contact_id, consent_basis)
  select i.organization_id, camp.id, i.id, ct.id, case when ct.consent_status = 'granted' then 'granted' else 'unknown' end
  from public.institutions i
  left join lateral (
    select c.id, c.consent_status from public.institution_contacts ic join public.contacts c on c.id = ic.contact_id
    where ic.institution_id = i.id and c.consent_status <> 'revoked' and c.status = 'active'
    order by ic.is_primary desc, c.consent_status = 'granted' desc, c.created_at limit 1
  ) ct on true
  where i.organization_id = camp.organization_id
    and i.status <> 'inactive'
    and public.can_see_institution(i)
    and (nullif(trim(p_country), '') is null or i.country_code = upper(trim(p_country)))
    and (coalesce(cardinality(p_types), 0) = 0 or i.institution_type = any (p_types))
    and (p_owner is null or i.owner_id = p_owner)
    and (nullif(p_status, '') is null or i.status = p_status)
    -- Fuera quien solo tiene contactos que pidieron no ser contactados.
    and (ct.id is not null or not exists (select 1 from public.institution_contacts ic where ic.institution_id = i.id))
  on conflict (campaign_id, institution_id) do nothing;
  get diagnostics n = row_count;

  update public.campaigns set segment = jsonb_strip_nulls(jsonb_build_object('country', nullif(upper(trim(p_country)), ''),
    'types', p_types, 'owner', p_owner, 'status', nullif(p_status, ''))) where id = camp.id;
  return n;
end $$;
revoke execute on function public.add_campaign_members(uuid, text, text[], uuid, text) from public, anon;
grant execute on function public.add_campaign_members(uuid, text, text[], uuid, text) to authenticated;

-- Lanza la campaña: una tarea de seguimiento por institución para su responsable, con vencimiento al inicio.
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

  insert into public.activities (organization_id, activity_type, subject, institution_id, contact_id, owner_id, due_at, priority, created_by, notes)
  select m.organization_id, 'follow_up', left('Campaña: ' || camp.name, 200), m.institution_id, m.contact_id,
         coalesce(i.owner_id, camp.owner_id),
         greatest(now(), (camp.start_date + time '09:00') at time zone 'America/Mexico_City'), 'normal', public.current_profile_id(),
         case when m.consent_basis = 'granted' then 'Contacto con consentimiento registrado.'
              else 'Sin consentimiento registrado: no envíes mensajes masivos; contacto uno a uno.' end
  from public.campaign_members m join public.institutions i on i.id = m.institution_id
  where m.campaign_id = camp.id;
  get diagnostics n = row_count;

  update public.campaigns set status = 'active', launched_at = now() where id = camp.id;
  return n;
end $$;
revoke execute on function public.launch_campaign(uuid) from public, anon;
grant execute on function public.launch_campaign(uuid) to authenticated;

-- Resultados con los permisos de quien consulta (RLS), en la moneda de la campaña.
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
                      where a.institution_id in (select institution_id from m) and a.status = 'pending' and a.subject = left('Campaña: ' || camp.name, 200)),
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
grant execute on function public.campaign_results(uuid) to authenticated;
