-- Fase 4: actividades y tareas, próxima actividad obligatoria, última interacción.

alter table public.organizations add column require_next_activity boolean not null default true;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  activity_type text not null check (activity_type in (
    'call', 'email', 'whatsapp', 'visit', 'meeting', 'video_call', 'presentation', 'proposal', 'follow_up', 'internal_task')),
  subject text not null check (length(trim(subject)) > 1),
  institution_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  owner_id uuid not null,
  due_at timestamptz,
  timezone text not null default 'America/Mexico_City',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  outcome text,
  notes text check (notes is null or length(notes) <= 5000),
  reminder_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (institution_id, organization_id) references public.institutions(id, organization_id),
  foreign key (contact_id, organization_id) references public.contacts(id, organization_id),
  foreign key (opportunity_id, organization_id) references public.opportunities(id, organization_id) on delete cascade,
  foreign key (owner_id, organization_id) references public.profiles(id, organization_id),
  foreign key (created_by, organization_id) references public.profiles(id, organization_id)
);
create index activities_owner_status_due on public.activities (owner_id, status, due_at);
create index activities_institution on public.activities (institution_id, status);
create index activities_opportunity on public.activities (opportunity_id, status);

-- Resumen para listados y la regla de higiene.
alter table public.institutions add column last_activity_at timestamptz, add column next_activity_at timestamptz;
alter table public.opportunities add column last_activity_at timestamptz, add column next_activity_at timestamptz;

-- Una actividad de una oportunidad cuelga de la institución de esa oportunidad.
create or replace function public.activity_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  opp_inst uuid;
begin
  if new.opportunity_id is not null then
    select institution_id into opp_inst from public.opportunities where id = new.opportunity_id;
    if new.institution_id is null then
      new.institution_id := opp_inst;
    elsif new.institution_id <> opp_inst then
      raise exception 'La actividad y la oportunidad son de instituciones distintas' using errcode = 'EB001';
    end if;
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger activities_before_write before insert or update on public.activities
for each row execute function public.activity_before_write();

-- Regla de higiene: al cerrar la última actividad pendiente de una oportunidad abierta, debe quedar otra programada.
create or replace function public.activity_require_next()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.opportunity_id is not null and new.status <> 'pending' and old.status = 'pending'
     and (select require_next_activity from public.organizations where id = new.organization_id)
     and exists (select 1 from public.opportunities where id = new.opportunity_id and status = 'open')
     and not exists (select 1 from public.activities where opportunity_id = new.opportunity_id and status = 'pending' and id <> new.id)
  then
    raise exception 'Programa la siguiente actividad de esta oportunidad antes de cerrar la actual' using errcode = 'EB001';
  end if;
  return new;
end;
$$;

create trigger activities_require_next before update on public.activities
for each row execute function public.activity_require_next();

create or replace function public.activity_summarize()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  inst uuid;
  opp uuid;
begin
  foreach inst in array array_remove(array[new.institution_id, old.institution_id], null) loop
    update public.institutions i set
      last_activity_at = (select max(completed_at) from public.activities where institution_id = inst and status = 'done'),
      next_activity_at = (select min(due_at) from public.activities where institution_id = inst and status = 'pending')
    where i.id = inst;
  end loop;
  foreach opp in array array_remove(array[new.opportunity_id, old.opportunity_id], null) loop
    update public.opportunities o set
      last_activity_at = (select max(completed_at) from public.activities where opportunity_id = opp and status = 'done'),
      next_activity_at = (select min(due_at) from public.activities where opportunity_id = opp and status = 'pending')
    where o.id = opp;
  end loop;
  return null;
end;
$$;

create trigger activities_summarize after insert or update or delete on public.activities
for each row execute function public.activity_summarize();

create trigger activities_set_updated_at before update on public.activities
for each row execute function public.set_updated_at();
create trigger activities_audit after insert or update or delete on public.activities
for each row execute function public.audit_row();

-- Administradores pueden cambiar la regla de higiene de su organización.
create policy organizations_update on public.organizations for update to authenticated
  using (id = public.current_org_id() and public.has_permission('admin.structure'))
  with check (id = public.current_org_id());

-- ============ RLS ============
alter table public.activities enable row level security;

create or replace function public.can_see_activity(a public.activities)
returns boolean language sql stable security definer set search_path = '' as $$
  select a.organization_id = public.current_org_id() and (
    a.owner_id = public.current_profile_id()
    or a.created_by = public.current_profile_id()
    or (a.institution_id is not null and public.can_see_institution_id(a.institution_id))
    or (a.opportunity_id is not null and public.can_see_opportunity_id(a.opportunity_id))
    or public.has_permission('institutions.read_all')
  )
$$;

create policy activities_select on public.activities for select to authenticated
  using (public.can_see_activity(activities));
create policy activities_insert on public.activities for insert to authenticated
  with check (
    organization_id = public.current_org_id() and created_by = public.current_profile_id() and public.has_permission('institutions.write')
    and (institution_id is null or public.can_see_institution_id(institution_id))
    and (opportunity_id is null or public.can_see_opportunity_id(opportunity_id))
  );
create policy activities_update on public.activities for update to authenticated
  using (public.can_see_activity(activities) and (owner_id = public.current_profile_id() or public.has_permission('institutions.write')))
  with check (organization_id = public.current_org_id());
