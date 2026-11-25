-- Automatizaciones por producto y etapa: el administrador las da de alta desde la pantalla.
-- Al entrar una oportunidad a la etapa elegida (al crearse o al moverla), se programa una tarea para su dueño.
-- La etapa ya define el producto: cada producto tiene su propio pipeline. Solo crean tareas internas; nunca envían mensajes.

create table public.stage_automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  stage_id uuid not null,
  activity_type text not null check (activity_type in (
    'call', 'email', 'whatsapp', 'visit', 'meeting', 'video_call', 'presentation', 'proposal', 'follow_up', 'internal_task')),
  subject text not null check (length(trim(subject)) between 2 and 120),
  days int not null default 1 check (days between 0 and 90),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (stage_id, organization_id) references public.pipeline_stages(id, organization_id) on delete cascade
);
create index stage_automation_rules_stage on public.stage_automation_rules (stage_id) where enabled;
create trigger stage_automation_rules_set_updated_at before update on public.stage_automation_rules
for each row execute function public.set_updated_at();
create trigger stage_automation_rules_audit after insert or update or delete on public.stage_automation_rules
for each row execute function public.audit_row();

alter table public.stage_automation_rules enable row level security;
create policy stage_automation_rules_select on public.stage_automation_rules for select to authenticated
  using (organization_id = public.current_org_id());
create policy stage_automation_rules_insert on public.stage_automation_rules for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_permission('admin.structure'));
create policy stage_automation_rules_update on public.stage_automation_rules for update to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'))
  with check (organization_id = public.current_org_id());
create policy stage_automation_rules_delete on public.stage_automation_rules for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_permission('admin.structure'));

create or replace function public.run_stage_automations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is null or current_setting('e2.importing', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then return new; end if;

  -- Idempotente: una tarea pendiente por regla, oportunidad y responsable (automation_key = 'stage:<regla>').
  insert into public.activities (organization_id, activity_type, subject, opportunity_id, owner_id, due_at, timezone, automation_key)
  select new.organization_id, r.activity_type, left(r.subject || ': ' || new.name, 200), new.id, new.owner_id,
         now() + make_interval(days => r.days), p.timezone, 'stage:' || r.id
  from public.stage_automation_rules r
  join public.profiles p on p.id = new.owner_id
  where r.stage_id = new.stage_id and r.enabled and r.organization_id = new.organization_id
    and not exists (select 1 from public.activities a where a.opportunity_id = new.id and a.automation_key = 'stage:' || r.id
                    and a.owner_id = new.owner_id and a.status = 'pending');
  return new;
end;
$$;
revoke execute on function public.run_stage_automations() from public, anon, authenticated;

create trigger opportunities_stage_automations after insert or update of stage_id on public.opportunities
for each row execute function public.run_stage_automations();
